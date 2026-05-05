import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { RatingsRepository } from './ratings.repository';

type Queryable = Pick<PoolClient, 'query'>;

type RankedResultParams = {
  matchId: string;
  gameTypeId: string;
  playerAUserId: string;
  playerBUserId: string;
  winnerUserId: string | null;
};

@Injectable()
export class RatingsService {
  private readonly DEFAULT_RATING = 1200;
  private readonly ELO_K_FACTOR = 32;

  constructor(private readonly ratingsRepository: RatingsRepository) {}

  private expectedScore(playerRating: number, opponentRating: number): number {
    return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  }

  private calculateNextRating(
    currentRating: number,
    expected: number,
    actual: number,
  ): number {
    return Math.round(currentRating + this.ELO_K_FACTOR * (actual - expected));
  }

  private async ensurePlayerRating(
    executor: Queryable,
    gameTypeId: string,
    userId: string,
  ) {
    let row = await this.ratingsRepository.findPlayerRating(gameTypeId, userId);

    if (!row) {
      await this.ratingsRepository.insertInitialPlayerRating(executor, {
        gameTypeId,
        userId,
        rating: this.DEFAULT_RATING,
      });

      row = await this.ratingsRepository.findPlayerRating(gameTypeId, userId);
    }

    if (!row) {
      throw new Error('Failed to initialize player rating');
    }

    return row;
  }

  async getMyRatings(userId: string) {
    const rows = await this.ratingsRepository.listUserRatingsWithDefaults(
      userId,
      this.DEFAULT_RATING,
    );

    return {
      ratings: rows.map((row) => ({
        gameTypeId: row.game_type_id,
        gameCode: row.game_code,
        gameName: row.game_name,
        supportsRanked: row.supports_ranked,
        rating: row.rating,
        gamesPlayed: row.games_played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        lastRankedMatchId: row.last_ranked_match_id,
        isInitialized: row.is_initialized,
      })),
    };
  }

  async processRanked1v1Result(
    executor: Queryable,
    params: RankedResultParams,
  ): Promise<void> {
    const playerA = await this.ensurePlayerRating(
      executor,
      params.gameTypeId,
      params.playerAUserId,
    );

    const playerB = await this.ensurePlayerRating(
      executor,
      params.gameTypeId,
      params.playerBUserId,
    );

    const expectedA = this.expectedScore(playerA.rating, playerB.rating);
    const expectedB = this.expectedScore(playerB.rating, playerA.rating);

    let actualA = 0.5;
    let actualB = 0.5;
    let resultCodeA: 'win' | 'loss' | 'draw' = 'draw';
    let resultCodeB: 'win' | 'loss' | 'draw' = 'draw';

    if (params.winnerUserId === params.playerAUserId) {
      actualA = 1;
      actualB = 0;
      resultCodeA = 'win';
      resultCodeB = 'loss';
    } else if (params.winnerUserId === params.playerBUserId) {
      actualA = 0;
      actualB = 1;
      resultCodeA = 'loss';
      resultCodeB = 'win';
    }

    const newRatingA = this.calculateNextRating(playerA.rating, expectedA, actualA);
    const newRatingB = this.calculateNextRating(playerB.rating, expectedB, actualB);

    await this.ratingsRepository.updatePlayerRating(executor, {
      gameTypeId: params.gameTypeId,
      userId: playerA.user_id,
      rating: newRatingA,
      gamesPlayed: playerA.games_played + 1,
      wins: playerA.wins + (resultCodeA === 'win' ? 1 : 0),
      losses: playerA.losses + (resultCodeA === 'loss' ? 1 : 0),
      draws: playerA.draws + (resultCodeA === 'draw' ? 1 : 0),
      lastRankedMatchId: params.matchId,
    });

    await this.ratingsRepository.updatePlayerRating(executor, {
      gameTypeId: params.gameTypeId,
      userId: playerB.user_id,
      rating: newRatingB,
      gamesPlayed: playerB.games_played + 1,
      wins: playerB.wins + (resultCodeB === 'win' ? 1 : 0),
      losses: playerB.losses + (resultCodeB === 'loss' ? 1 : 0),
      draws: playerB.draws + (resultCodeB === 'draw' ? 1 : 0),
      lastRankedMatchId: params.matchId,
    });

    await this.ratingsRepository.insertRatingHistory(executor, {
      ratingEventId: randomUUID(),
      matchId: params.matchId,
      gameTypeId: params.gameTypeId,
      userId: playerA.user_id,
      resultCode: resultCodeA,
      oldRating: playerA.rating,
      newRating: newRatingA,
      ratingDelta: newRatingA - playerA.rating,
    });

    await this.ratingsRepository.insertRatingHistory(executor, {
      ratingEventId: randomUUID(),
      matchId: params.matchId,
      gameTypeId: params.gameTypeId,
      userId: playerB.user_id,
      resultCode: resultCodeB,
      oldRating: playerB.rating,
      newRating: newRatingB,
      ratingDelta: newRatingB - playerB.rating,
    });
  }
}