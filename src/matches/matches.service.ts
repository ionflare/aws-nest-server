import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { PlayMoveDto } from './dto/play-move.dto';
import { GameEngineRegistry } from './engines/game-engine.registry';
import { GamePlayer } from './engines/game-engine.interface';
import {
  MatchInternalRow,
  MatchPlayerInternalRow,
  MatchesRepository,
} from './matches.repository';
import { ParticipationService } from '../participation/participation.service';
@Injectable()
export class MatchesService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly matchesRepository: MatchesRepository,
    private readonly gameEngineRegistry: GameEngineRegistry,
    private readonly participationService: ParticipationService,
  ) { }

  private toGamePlayers(players: MatchPlayerInternalRow[]): GamePlayer[] {
    return players.map((player) => ({
      userId: player.user_id,
      seatNo: player.seat_no,
    }));
  }

  private toMatchView(
    match: MatchInternalRow,
    gameType: { game_code: string; game_name: string },
    players: MatchPlayerInternalRow[],
  ) {
    const currentState = match.current_state_text
      ? JSON.parse(match.current_state_text)
      : null;

    const stateSymbols = currentState?.symbols ?? [];

    return {
      matchId: match.match_id,
      roomId: match.room_id,
      gameTypeId: match.game_type_id,
      gameCode: gameType.game_code,
      gameName: gameType.game_name,
      matchStatus: match.match_status,
      currentTurnNo: match.current_turn_no,
      currentPlayerUserId: match.current_player_user_id,
      winnerUserId: match.winner_user_id,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      currentState,
      players: players.map((player) => ({
        matchPlayerId: player.match_player_id,
        matchId: player.match_id,
        userId: player.user_id,
        username: player.username,
        displayName: player.display_name,
        seatNo: player.seat_no,
        symbol:
          stateSymbols.find((item: any) => item.userId === player.user_id)?.symbol ?? null,
      })),
    };
  }

  async getMatch(matchId: string, userId: string) {
    const isMember = await this.matchesRepository.isMatchMember(matchId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this match');
    }

    const match = await this.matchesRepository.findMatchById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const gameType = await this.matchesRepository.findGameTypeById(match.game_type_id);
    if (!gameType) {
      throw new NotFoundException('Game type not found');
    }

    const players = await this.matchesRepository.getMatchPlayers(matchId);

    return {
      match: this.toMatchView(match, gameType, players),
    };
  }

  async playMove(userId: string, dto: PlayMoveDto) {
    const isMember = await this.matchesRepository.isMatchMember(dto.matchId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this match');
    }

    const match = await this.matchesRepository.findMatchById(dto.matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.match_status !== 'active') {
      throw new ConflictException('Match is not active');
    }

    const gameType = await this.matchesRepository.findGameTypeById(match.game_type_id);
    if (!gameType) {
      throw new NotFoundException('Game type not found');
    }

    const engine = this.gameEngineRegistry.get(gameType.game_code);
    const players = await this.matchesRepository.getMatchPlayers(dto.matchId);
    const gamePlayers = this.toGamePlayers(players);

    const currentState = match.current_state_text
      ? JSON.parse(match.current_state_text)
      : null;

    if (!currentState) {
      throw new ConflictException('Match has no current state');
    }

    engine.validateMove({
      state: currentState,
      userId,
      move: dto.move,
      players: gamePlayers,
      currentPlayerUserId: match.current_player_user_id,
    });

    const result = engine.applyMove({
      state: currentState,
      userId,
      move: dto.move,
      players: gamePlayers,
      currentPlayerUserId: match.current_player_user_id,
    });

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.matchesRepository.insertMatchMove(client, {
        moveId: randomUUID(),
        matchId: dto.matchId,
        turnNo: match.current_turn_no,
        actionNo: 1,
        userId,
        moveType: result.moveType,
        movePayloadText: JSON.stringify(result.movePayload),
        stateAfterText: JSON.stringify(result.nextState),
      });

      await this.matchesRepository.updateMatchAfterMove(client, {
        matchId: dto.matchId,
        matchStatus: result.finished ? 'finished' : 'active',
        currentTurnNo: match.current_turn_no + 1,
        currentPlayerUserId: result.nextPlayerUserId,
        winnerUserId: result.winnerUserId,
        currentStateText: JSON.stringify(result.nextState),
        finished: result.finished,
      });

      if (result.finished) {
        await this.participationService.releaseMatchMembershipsForMatch(
          client,
          dto.matchId,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }

    return this.getMatch(dto.matchId, userId);
  }
}
