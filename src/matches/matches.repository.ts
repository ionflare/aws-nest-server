import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type MatchInternalRow = QueryResultRow & {
  match_id: string;
  room_id: string | null;
  game_type_id: string;
  started_by_user_id: string;
  match_status: string;
  match_mode: string;
  ranked_flag: boolean;
  current_turn_no: number;
  current_player_user_id: string | null;
  winner_user_id: string | null;
  turn_time_limit_sec: number;
  turn_expires_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  initial_state_text: string | null;
  current_state_text: string | null;
  created_at: string;
};

export type MatchPlayerInternalRow = QueryResultRow & {
  match_player_id: string;
  match_id: string;
  user_id: string;
  username: string;
  display_name: string;
  seat_no: number;
  is_bot: boolean;
  is_eliminated: boolean;
  score: string;
  joined_at: string;
};

export type GameTypeLiteRow = QueryResultRow & {
  game_type_id: string;
  game_code: string;
  game_name: string;
  turn_timeout_sec: number;
};

@Injectable()
export class MatchesRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async findMatchById(matchId: string): Promise<MatchInternalRow | null> {
    const result = await this.db.query<MatchInternalRow>(
      `
      SELECT
        match_id,
        room_id,
        game_type_id,
        started_by_user_id,
        match_status,
        match_mode,
        ranked_flag,
        current_turn_no,
        current_player_user_id,
        winner_user_id,
        turn_time_limit_sec,
        turn_expires_at,
        started_at,
        ended_at,
        initial_state_text,
        current_state_text,
        created_at
      FROM boardgame_prod.matches
      WHERE match_id = $1
      LIMIT 1
      `,
      [matchId],
    );

    return result.rows[0] ?? null;
  }

  async findGameTypeById(gameTypeId: string): Promise<GameTypeLiteRow | null> {
    const result = await this.db.query<GameTypeLiteRow>(
      `
      SELECT
        game_type_id,
        game_code,
        game_name,
        turn_timeout_sec
      FROM boardgame_prod.game_types
      WHERE game_type_id = $1
      LIMIT 1
      `,
      [gameTypeId],
    );

    return result.rows[0] ?? null;
  }

  async isMatchMember(matchId: string, userId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM boardgame_prod.match_players
        WHERE match_id = $1
          AND user_id = $2
      ) AS exists
      `,
      [matchId, userId],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async getMatchPlayers(matchId: string): Promise<MatchPlayerInternalRow[]> {
    const result = await this.db.query<MatchPlayerInternalRow>(
      `
      SELECT
        mp.match_player_id,
        mp.match_id,
        mp.user_id,
        u.username,
        u.display_name,
        mp.seat_no,
        mp.is_bot,
        mp.is_eliminated,
        mp.score,
        mp.joined_at
      FROM boardgame_prod.match_players mp
      JOIN boardgame_prod.app_users u
        ON u.user_id = mp.user_id
      WHERE mp.match_id = $1
      ORDER BY mp.seat_no ASC
      `,
      [matchId],
    );

    return result.rows;
  }

  async listExpiredActiveMatches(limit = 20): Promise<MatchInternalRow[]> {
    const result = await this.db.query<MatchInternalRow>(
      `
      SELECT
        match_id,
        room_id,
        game_type_id,
        started_by_user_id,
        match_status,
        match_mode,
        ranked_flag,
        current_turn_no,
        current_player_user_id,
        winner_user_id,
        turn_time_limit_sec,
        turn_expires_at,
        started_at,
        ended_at,
        initial_state_text,
        current_state_text,
        created_at
      FROM boardgame_prod.matches
      WHERE match_status = 'active'
        AND turn_expires_at IS NOT NULL
        AND turn_expires_at <= CURRENT_TIMESTAMP
      ORDER BY turn_expires_at ASC
      LIMIT $1
      `,
      [limit],
    );

    return result.rows;
  }

  async insertMatchMove(
    executor: Queryable,
    params: {
      moveId: string;
      matchId: string;
      turnNo: number;
      actionNo: number;
      userId: string;
      moveType: string;
      movePayloadText: string;
      stateAfterText: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.match_moves (
        move_id,
        match_id,
        turn_no,
        action_no,
        user_id,
        move_type,
        move_payload_text,
        state_after_text,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `,
      [
        params.moveId,
        params.matchId,
        params.turnNo,
        params.actionNo,
        params.userId,
        params.moveType,
        params.movePayloadText,
        params.stateAfterText,
      ],
    );
  }

  async updateMatchState(
    executor: Queryable,
    params: {
      matchId: string;
      matchStatus: string;
      currentTurnNo: number;
      currentPlayerUserId: string | null;
      winnerUserId: string | null;
      currentStateText: string;
      turnExpiresAt: Date | null;
      finished: boolean;
    },
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.matches
      SET
        match_status = $2,
        current_turn_no = $3,
        current_player_user_id = $4,
        winner_user_id = $5,
        current_state_text = $6,
        turn_expires_at = $7,
        ended_at = CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE ended_at END
      WHERE match_id = $1
      `,
      [
        params.matchId,
        params.matchStatus,
        params.currentTurnNo,
        params.currentPlayerUserId,
        params.winnerUserId,
        params.currentStateText,
        params.turnExpiresAt,
        params.finished,
      ],
    );
  }
}