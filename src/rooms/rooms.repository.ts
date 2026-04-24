import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type GameTypeRow = QueryResultRow & {
  game_type_id: string;
  game_code: string;
  game_name: string;
  min_players: number;
  max_players: number;
};

export type RoomInternalRow = QueryResultRow & {
  room_id: string;
  room_code: string;
  game_type_id: string;
  room_name: string;
  host_user_id: string;
  is_private: boolean;
  room_password_hash: string | null;
  max_players: number;
  room_status: string;
  settings_text: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomMemberRow = QueryResultRow & {
  room_player_id: string;
  room_id: string;
  user_id: string;
  username: string;
  display_name: string;
  seat_no: number | null;
  is_ready: boolean;
  is_host: boolean;
  joined_at: string;
};

export type RoomPlayerInternalRow = QueryResultRow & {
  room_player_id: string;
  room_id: string;
  user_id: string;
  seat_no: number | null;
  is_ready: boolean;
  is_host: boolean;
  joined_at: string;
};

@Injectable()
export class RoomsRepository {
  constructor(private readonly db: AuroraDsqlService) { }

  async findGameTypeById(gameTypeId: string): Promise<GameTypeRow | null> {
    const result = await this.db.query<GameTypeRow>(
      `
      SELECT
        game_type_id,
        game_code,
        game_name,
        min_players,
        max_players
      FROM boardgame_prod.game_types
      WHERE game_type_id = $1
      LIMIT 1
      `,
      [gameTypeId],
    );

    return result.rows[0] ?? null;
  }

  async insertRoom(
    executor: Queryable,
    params: {
      roomId: string;
      roomCode: string;
      gameTypeId: string;
      roomName: string;
      hostUserId: string;
      isPrivate: boolean;
      roomPasswordHash?: string | null;
      maxPlayers: number;
      settingsText?: string | null;
    },
  ): Promise<RoomInternalRow> {
    const result = await executor.query<RoomInternalRow>(
      `
      INSERT INTO boardgame_prod.game_rooms (
        room_id,
        room_code,
        game_type_id,
        room_name,
        host_user_id,
        is_private,
        room_password_hash,
        max_players,
        room_status,
        settings_text,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        'waiting',
        $9,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING
        room_id,
        room_code,
        game_type_id,
        room_name,
        host_user_id,
        is_private,
        room_password_hash,
        max_players,
        room_status,
        settings_text,
        created_at,
        updated_at
      `,
      [
        params.roomId,
        params.roomCode,
        params.gameTypeId,
        params.roomName,
        params.hostUserId,
        params.isPrivate,
        params.roomPasswordHash ?? null,
        params.maxPlayers,
        params.settingsText ?? null,
      ],
    );

    return result.rows[0];
  }

  async insertRoomPlayer(
    executor: Queryable,
    params: {
      roomPlayerId: string;
      roomId: string;
      userId: string;
      seatNo: number;
      isReady?: boolean;
      isHost?: boolean;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.room_players (
        room_player_id,
        room_id,
        user_id,
        seat_no,
        is_ready,
        is_host,
        joined_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `,
      [
        params.roomPlayerId,
        params.roomId,
        params.userId,
        params.seatNo,
        params.isReady ?? false,
        params.isHost ?? false,
      ],
    );
  }

  async findRoomByCode(roomCode: string): Promise<RoomInternalRow | null> {
    const result = await this.db.query<RoomInternalRow>(
      `
      SELECT
        room_id,
        room_code,
        game_type_id,
        room_name,
        host_user_id,
        is_private,
        room_password_hash,
        max_players,
        room_status,
        settings_text,
        created_at,
        updated_at
      FROM boardgame_prod.game_rooms
      WHERE room_code = $1
      LIMIT 1
      `,
      [roomCode],
    );

    return result.rows[0] ?? null;
  }

  async findRoomById(roomId: string): Promise<RoomInternalRow | null> {
    const result = await this.db.query<RoomInternalRow>(
      `
      SELECT
        room_id,
        room_code,
        game_type_id,
        room_name,
        host_user_id,
        is_private,
        room_password_hash,
        max_players,
        room_status,
        settings_text,
        created_at,
        updated_at
      FROM boardgame_prod.game_rooms
      WHERE room_id = $1
      LIMIT 1
      `,
      [roomId],
    );

    return result.rows[0] ?? null;
  }

  async isRoomMember(roomId: string, userId: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM boardgame_prod.room_players
        WHERE room_id = $1
          AND user_id = $2
      ) AS exists
      `,
      [roomId, userId],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async findRoomPlayerByUserId(
    roomId: string,
    userId: string,
  ): Promise<RoomPlayerInternalRow | null> {
    const result = await this.db.query<RoomPlayerInternalRow>(
      `
      SELECT
        room_player_id,
        room_id,
        user_id,
        seat_no,
        is_ready,
        is_host,
        joined_at
      FROM boardgame_prod.room_players
      WHERE room_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [roomId, userId],
    );

    return result.rows[0] ?? null;
  }

  async getRoomMemberCount(roomId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM boardgame_prod.room_players
      WHERE room_id = $1
      `,
      [roomId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async getOccupiedSeats(roomId: string): Promise<number[]> {
    const result = await this.db.query<{ seat_no: number | null }>(
      `
      SELECT seat_no
      FROM boardgame_prod.room_players
      WHERE room_id = $1
        AND seat_no IS NOT NULL
      ORDER BY seat_no
      `,
      [roomId],
    );

    return result.rows
      .map((row) => row.seat_no)
      .filter((seat): seat is number => typeof seat === 'number');
  }

  async getRoomMembers(roomId: string): Promise<RoomMemberRow[]> {
    const result = await this.db.query<RoomMemberRow>(
      `
      SELECT
        rp.room_player_id,
        rp.room_id,
        rp.user_id,
        u.username,
        u.display_name,
        rp.seat_no,
        rp.is_ready,
        rp.is_host,
        rp.joined_at
      FROM boardgame_prod.room_players rp
      JOIN boardgame_prod.app_users u
        ON u.user_id = rp.user_id
      WHERE rp.room_id = $1
      ORDER BY rp.seat_no ASC, rp.joined_at ASC
      `,
      [roomId],
    );

    return result.rows;
  }

  async deleteRoomPlayer(
    executor: Queryable,
    roomId: string,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.room_players
      WHERE room_id = $1
        AND user_id = $2
      `,
      [roomId, userId],
    );
  }

  async findNextHostCandidate(roomId: string): Promise<{ user_id: string } | null> {
    const result = await this.db.query<{ user_id: string }>(
      `
      SELECT user_id
      FROM boardgame_prod.room_players
      WHERE room_id = $1
      ORDER BY seat_no ASC NULLS LAST, joined_at ASC
      LIMIT 1
      `,
      [roomId],
    );

    return result.rows[0] ?? null;
  }

  async clearHostFlags(executor: Queryable, roomId: string): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.room_players
      SET is_host = false
      WHERE room_id = $1
      `,
      [roomId],
    );
  }

  async setHostFlag(
    executor: Queryable,
    roomId: string,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.room_players
      SET is_host = true
      WHERE room_id = $1
        AND user_id = $2
      `,
      [roomId, userId],
    );
  }

  async updateRoomHostUserId(
    executor: Queryable,
    roomId: string,
    hostUserId: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.game_rooms
      SET host_user_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
      `,
      [roomId, hostUserId],
    );
  }

  async deleteRoom(executor: Queryable, roomId: string): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.game_rooms
      WHERE room_id = $1
      `,
      [roomId],
    );
  }
  async listGameTypes(): Promise<GameTypeRow[]> {
    const result = await this.db.query<GameTypeRow>(
      `
    SELECT
      game_type_id,
      game_code,
      game_name,
      min_players,
      max_players
    FROM boardgame_prod.game_types
    ORDER BY game_name ASC
    `,
    );

    return result.rows;
  }

  async updateRoomPlayerReady(
    executor: Queryable,
    roomId: string,
    userId: string,
    isReady: boolean,
  ): Promise<void> {
    await executor.query(
      `
    UPDATE boardgame_prod.room_players
    SET is_ready = $3
    WHERE room_id = $1
      AND user_id = $2
    `,
      [roomId, userId, isReady],
    );
  }

  async updateRoomStatus(
    executor: Queryable,
    roomId: string,
    roomStatus: string,
  ): Promise<void> {
    await executor.query(
      `
    UPDATE boardgame_prod.game_rooms
    SET room_status = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE room_id = $1
    `,
      [roomId, roomStatus],
    );
  }

  async insertMatch(
    executor: Queryable,
    params: {
      matchId: string;
      roomId: string;
      gameTypeId: string;
      startedByUserId: string;
      currentPlayerUserId: string | null;
      turnTimeLimitSec: number;
      turnExpiresAt: Date | null;
      initialStateText?: string | null;
      currentStateText?: string | null;
    },
  ): Promise<{ match_id: string }> {
    const result = await executor.query<{ match_id: string }>(
      `
    INSERT INTO boardgame_prod.matches (
      match_id,
      room_id,
      game_type_id,
      started_by_user_id,
      match_status,
      match_mode,
      ranked_flag,
      current_turn_no,
      current_player_user_id,
      turn_time_limit_sec,
      turn_expires_at,
      started_at,
      initial_state_text,
      current_state_text,
      created_at
    )
    VALUES (
      $1, $2, $3, $4,
      'active',
      'casual',
      false,
      1,
      $5,
      $6,
      $7,
      CURRENT_TIMESTAMP,
      $8,
      $9,
      CURRENT_TIMESTAMP
    )
    RETURNING match_id
    `,
      [
        params.matchId,
        params.roomId,
        params.gameTypeId,
        params.startedByUserId,
        params.currentPlayerUserId,
        params.turnTimeLimitSec,
        params.turnExpiresAt,
        params.initialStateText ?? null,
        params.currentStateText ?? null,
      ],
    );

    return result.rows[0];
  }

  async insertMatchPlayer(
    executor: Queryable,
    params: {
      matchPlayerId: string;
      matchId: string;
      userId: string;
      seatNo: number;
      isBot?: boolean;
    },
  ): Promise<void> {
    await executor.query(
      `
    INSERT INTO boardgame_prod.match_players (
      match_player_id,
      match_id,
      user_id,
      seat_no,
      is_bot,
      is_eliminated,
      score,
      joined_at
    )
    VALUES ($1, $2, $3, $4, $5, false, 0, CURRENT_TIMESTAMP)
    `,
      [
        params.matchPlayerId,
        params.matchId,
        params.userId,
        params.seatNo,
        params.isBot ?? false,
      ],
    );
  }
}
