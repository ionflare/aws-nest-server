import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { ParticipationService } from '../participation/participation.service';
import { PlayMoveDto } from './dto/play-move.dto';
import { GameEngineRegistry } from './engines/game-engine.registry';
import { GamePlayer } from './engines/game-engine.interface';
import { MatchEventsService } from './match-events.service';
import {
  MatchInternalRow,
  MatchPlayerInternalRow,
  MatchesRepository,
} from './matches.repository';

@Injectable()
export class MatchesService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly matchesRepository: MatchesRepository,
    private readonly gameEngineRegistry: GameEngineRegistry,
    private readonly participationService: ParticipationService,
    private readonly matchEventsService: MatchEventsService,
  ) { }

  private toGamePlayers(players: MatchPlayerInternalRow[]): GamePlayer[] {
    return players.map((player) => ({
      userId: player.user_id,
      seatNo: player.seat_no,
    }));
  }

  private isExpired(match: MatchInternalRow): boolean {
    if (!match.turn_expires_at) return false;
    return new Date(match.turn_expires_at).getTime() <= Date.now();
  }

  private getNextTurnExpiresAt(
    match: MatchInternalRow,
    nextPlayerUserId: string | null,
  ): Date | null {
    if (!nextPlayerUserId) return null;
    if (!match.turn_time_limit_sec || match.turn_time_limit_sec <= 0) return null;

    return new Date(Date.now() + match.turn_time_limit_sec * 1000);
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
      turnTimeLimitSec: match.turn_time_limit_sec,
      turnExpiresAt: match.turn_expires_at,
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

    if (this.isExpired(match)) {
      throw new ConflictException('Turn time already expired');
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

    const nextTurnExpiresAt = result.finished
      ? null
      : this.getNextTurnExpiresAt(match, result.nextPlayerUserId);

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

      await this.matchesRepository.updateMatchState(client, {
        matchId: dto.matchId,
        matchStatus: result.finished ? 'finished' : 'active',
        currentTurnNo: match.current_turn_no + 1,
        currentPlayerUserId: result.nextPlayerUserId,
        winnerUserId: result.winnerUserId,
        currentStateText: JSON.stringify(result.nextState),
        turnExpiresAt: nextTurnExpiresAt,
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

    this.matchEventsService.emitMatchStateUpdated(dto.matchId);

    return this.getMatch(dto.matchId, userId);
  }

  async concedeMatch(matchId: string, userId: string) {
    const isMember = await this.matchesRepository.isMatchMember(matchId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this match');
    }

    const match = await this.matchesRepository.findMatchById(matchId);
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
    const players = await this.matchesRepository.getMatchPlayers(matchId);
    const gamePlayers = this.toGamePlayers(players);

    const currentState = match.current_state_text
      ? JSON.parse(match.current_state_text)
      : null;

    if (!currentState) {
      throw new ConflictException('Match has no current state');
    }

    const result = engine.resolveConcede({
      state: currentState,
      concededUserId: userId,
      players: gamePlayers,
      currentPlayerUserId: match.current_player_user_id,
    });

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.matchesRepository.insertMatchMove(client, {
        moveId: randomUUID(),
        matchId,
        turnNo: match.current_turn_no,
        actionNo: 1,
        userId,
        moveType: result.moveType,
        movePayloadText: JSON.stringify(result.movePayload),
        stateAfterText: JSON.stringify(result.nextState),
      });

      await this.matchesRepository.updateMatchState(client, {
        matchId,
        matchStatus: 'finished',
        currentTurnNo: match.current_turn_no,
        currentPlayerUserId: null,
        winnerUserId: result.winnerUserId,
        currentStateText: JSON.stringify(result.nextState),
        turnExpiresAt: null,
        finished: true,
      });

      await this.participationService.releaseMatchMembershipsForMatch(client, matchId);

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

    this.matchEventsService.emitMatchStateUpdated(matchId);

    return this.getMatch(matchId, userId);
  }

  async resolveTimeout(matchId: string): Promise<void> {
    const match = await this.matchesRepository.findMatchById(matchId);
    if (!match) return;
    if (match.match_status !== 'active') return;
    if (!match.current_player_user_id) return;
    if (!this.isExpired(match)) return;

    const gameType = await this.matchesRepository.findGameTypeById(match.game_type_id);
    if (!gameType) {
      throw new NotFoundException('Game type not found');
    }

    const engine = this.gameEngineRegistry.get(gameType.game_code);
    const players = await this.matchesRepository.getMatchPlayers(matchId);
    const gamePlayers = this.toGamePlayers(players);

    const currentState = match.current_state_text
      ? JSON.parse(match.current_state_text)
      : null;

    if (!currentState) {
      throw new ConflictException('Match has no current state');
    }

    const result = engine.resolveTimeout({
      state: currentState,
      timedOutUserId: match.current_player_user_id,
      players: gamePlayers,
      currentPlayerUserId: match.current_player_user_id,
    });

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.matchesRepository.insertMatchMove(client, {
        moveId: randomUUID(),
        matchId,
        turnNo: match.current_turn_no,
        actionNo: 1,
        userId: match.current_player_user_id,
        moveType: result.moveType,
        movePayloadText: JSON.stringify(result.movePayload),
        stateAfterText: JSON.stringify(result.nextState),
      });

      await this.matchesRepository.updateMatchState(client, {
        matchId,
        matchStatus: 'finished',
        currentTurnNo: match.current_turn_no,
        currentPlayerUserId: null,
        winnerUserId: result.winnerUserId,
        currentStateText: JSON.stringify(result.nextState),
        turnExpiresAt: null,
        finished: true,
      });

      await this.participationService.releaseMatchMembershipsForMatch(
        client,
        matchId,
      );

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

    this.matchEventsService.emitMatchStateUpdated(matchId);
  }

  async resolveExpiredMatches(limit = 20) {
    const expiredMatches =
      await this.matchesRepository.listExpiredActiveMatches(limit);

    for (const match of expiredMatches) {
      await this.resolveTimeout(match.match_id);
    }
  }

  async createDirectMatch(params: {
    gameTypeId: string;
    players: GamePlayer[];
    startedByUserId: string;
    roomId?: string | null;
  }) {
    const gameType = await this.matchesRepository.findGameTypeById(params.gameTypeId);

    if (!gameType) {
      throw new NotFoundException('Game type not found');
    }

    const engine = this.gameEngineRegistry.get(gameType.game_code);

    const sortedPlayers = [...params.players].sort((a, b) => a.seatNo - b.seatNo);

    const { initialState, startingPlayerUserId } =
      engine.createInitialState(sortedPlayers);

    const initialStateText = JSON.stringify(initialState);
    const currentStateText = initialStateText;

    const turnTimeLimitSec = gameType.turn_timeout_sec ?? 60;
    const turnExpiresAt =
      startingPlayerUserId && turnTimeLimitSec > 0
        ? new Date(Date.now() + turnTimeLimitSec * 1000)
        : null;

    const matchId = randomUUID();
    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.matchesRepository.insertMatch(client, {
        matchId,
        roomId: params.roomId ?? null,
        gameTypeId: params.gameTypeId,
        startedByUserId: params.startedByUserId,
        currentPlayerUserId: startingPlayerUserId,
        turnTimeLimitSec,
        turnExpiresAt,
        initialStateText,
        currentStateText,
      });

      for (const player of sortedPlayers) {
        await this.matchesRepository.insertMatchPlayer(client, {
          matchPlayerId: randomUUID(),
          matchId,
          userId: player.userId,
          seatNo: player.seatNo,
        });

        await this.participationService.acquireMatchMembership(
          client,
          player.userId,
          matchId,
        );
      }

      await client.query('COMMIT');

      return {
        matchId,
      };
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
  }
}