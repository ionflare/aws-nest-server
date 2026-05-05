import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type PlayerRatingRow = QueryResultRow & {
  game_type_id: string;
  user_id: string;
  rating: number;
  rating_deviation: number | null;
  volatility: string | null;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  last_ranked_match_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type UserRatingViewRow = QueryResultRow & {
  game_type_id: string;
  game_code: string;
  game_name: string;
  supports_ranked: boolean;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  last_ranked_match_id: string | null;
  is_initialized: boolean;
};

@Injectable()
export class RatingsRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async findPlayerRating(
    gameTypeId: string,
    userId: string,
  ): Promise<PlayerRatingRow | null> {
    const result = await this.db.query<PlayerRatingRow>(
      `
      SELECT
        game_type_id,
        user_id,
        rating,
        rating_deviation,
        volatility,
        games_played,
        wins,
        losses,
        draws,
        last_ranked_match_id,
        created_at,
        updated_at
      FROM boardgame_prod.player_ratings
      WHERE game_type_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [gameTypeId, userId],
    );

    return result.rows[0] ?? null;
  }

  async listUserRatingsWithDefaults(
    userId: string,
    defaultRating: number,
  ): Promise<UserRatingViewRow[]> {
    const result = await this.db.query<UserRatingViewRow>(
      `
      SELECT
        gt.game_type_id,
        gt.game_code,
        gt.game_name,
        gt.supports_ranked,
        COALESCE(pr.rating, $2) AS rating,
        COALESCE(pr.games_played, 0) AS games_played,
        COALESCE(pr.wins, 0) AS wins,
        COALESCE(pr.losses, 0) AS losses,
        COALESCE(pr.draws, 0) AS draws,
        pr.last_ranked_match_id,
        CASE WHEN pr.user_id IS NULL THEN false ELSE true END AS is_initialized
      FROM boardgame_prod.game_types gt
      LEFT JOIN boardgame_prod.player_ratings pr
        ON pr.game_type_id = gt.game_type_id
       AND pr.user_id = $1
      ORDER BY gt.game_name ASC
      `,
      [userId, defaultRating],
    );

    return result.rows;
  }

  async insertInitialPlayerRating(
    executor: Queryable,
    params: {
      gameTypeId: string;
      userId: string;
      rating: number;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.player_ratings (
        game_type_id,
        user_id,
        rating,
        rating_deviation,
        volatility,
        games_played,
        wins,
        losses,
        draws,
        last_ranked_match_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, NULL, NULL, 0, 0, 0, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      `,
      [params.gameTypeId, params.userId, params.rating],
    );
  }

  async updatePlayerRating(
    executor: Queryable,
    params: {
      gameTypeId: string;
      userId: string;
      rating: number;
      gamesPlayed: number;
      wins: number;
      losses: number;
      draws: number;
      lastRankedMatchId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.player_ratings
      SET
        rating = $3,
        games_played = $4,
        wins = $5,
        losses = $6,
        draws = $7,
        last_ranked_match_id = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE game_type_id = $1
        AND user_id = $2
      `,
      [
        params.gameTypeId,
        params.userId,
        params.rating,
        params.gamesPlayed,
        params.wins,
        params.losses,
        params.draws,
        params.lastRankedMatchId,
      ],
    );
  }

  async insertRatingHistory(
    executor: Queryable,
    params: {
      ratingEventId: string;
      matchId: string;
      gameTypeId: string;
      userId: string;
      resultCode: 'win' | 'loss' | 'draw';
      oldRating: number;
      newRating: number;
      ratingDelta: number;
      calculationVersion?: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.rating_history (
        rating_event_id,
        match_id,
        game_type_id,
        user_id,
        result_code,
        old_rating,
        new_rating,
        rating_delta,
        old_rating_deviation,
        new_rating_deviation,
        old_volatility,
        new_volatility,
        calculation_version,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        NULL, NULL, NULL, NULL, $9, CURRENT_TIMESTAMP
      )
      `,
      [
        params.ratingEventId,
        params.matchId,
        params.gameTypeId,
        params.userId,
        params.resultCode,
        params.oldRating,
        params.newRating,
        params.ratingDelta,
        params.calculationVersion ?? 'elo_v1',
      ],
    );
  }
}