import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

export type ChatMessageRow = QueryResultRow & {
  message_id: string;
  room_id: string | null;
  match_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  message_type: string;
  message_text: string;
  created_at: string;
};

type Queryable = Pick<PoolClient, 'query'>;

@Injectable()
export class ChatRepository {
  constructor(private readonly db: AuroraDsqlService) {}

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

  async insertChatMessage(
    executor: Queryable,
    params: {
      messageId: string;
      roomId?: string | null;
      matchId?: string | null;
      userId: string;
      messageText: string;
    },
  ): Promise<ChatMessageRow> {
    const result = await executor.query<ChatMessageRow>(
      `
      INSERT INTO boardgame_prod.chat_messages (
        message_id,
        room_id,
        match_id,
        user_id,
        message_type,
        message_text,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'text', $5, CURRENT_TIMESTAMP)
      RETURNING
        message_id,
        room_id,
        match_id,
        user_id,
        message_type,
        message_text,
        created_at
      `,
      [
        params.messageId,
        params.roomId ?? null,
        params.matchId ?? null,
        params.userId,
        params.messageText,
      ],
    );

    const inserted = result.rows[0];

    const userResult = await executor.query<{
      username: string;
      display_name: string;
    }>(
      `
      SELECT username, display_name
      FROM boardgame_prod.app_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [params.userId],
    );

    return {
      ...inserted,
      username: userResult.rows[0]?.username ?? '',
      display_name: userResult.rows[0]?.display_name ?? '',
    };
  }

  async getRecentRoomMessages(roomId: string, limit = 50): Promise<ChatMessageRow[]> {
    const result = await this.db.query<ChatMessageRow>(
      `
      SELECT
        cm.message_id,
        cm.room_id,
        cm.match_id,
        cm.user_id,
        u.username,
        u.display_name,
        cm.message_type,
        cm.message_text,
        cm.created_at
      FROM boardgame_prod.chat_messages cm
      JOIN boardgame_prod.app_users u
        ON u.user_id = cm.user_id
      WHERE cm.room_id = $1
      ORDER BY cm.created_at DESC
      LIMIT $2
      `,
      [roomId, limit],
    );

    return result.rows.reverse();
  }

  async getRecentMatchMessages(matchId: string, limit = 50): Promise<ChatMessageRow[]> {
    const result = await this.db.query<ChatMessageRow>(
      `
      SELECT
        cm.message_id,
        cm.room_id,
        cm.match_id,
        cm.user_id,
        u.username,
        u.display_name,
        cm.message_type,
        cm.message_text,
        cm.created_at
      FROM boardgame_prod.chat_messages cm
      JOIN boardgame_prod.app_users u
        ON u.user_id = cm.user_id
      WHERE cm.match_id = $1
      ORDER BY cm.created_at DESC
      LIMIT $2
      `,
      [matchId, limit],
    );

    return result.rows.reverse();
  }
}
