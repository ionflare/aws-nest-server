import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { ChatRepository } from './chat.repository';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly chatRepository: ChatRepository,
  ) {}

  private validateTarget(dto: SendChatMessageDto) {
    const hasRoomId = Boolean(dto.roomId);
    const hasMatchId = Boolean(dto.matchId);

    if (hasRoomId === hasMatchId) {
      throw new BadRequestException(
        'Exactly one of roomId or matchId is required',
      );
    }
  }

  async assertUserCanChat(userId: string, dto: SendChatMessageDto): Promise<void> {
    this.validateTarget(dto);

    if (dto.roomId) {
      const ok = await this.chatRepository.isRoomMember(dto.roomId, userId);
      if (!ok) {
        throw new ForbiddenException('You are not a member of this room');
      }
      return;
    }

    if (dto.matchId) {
      const ok = await this.chatRepository.isMatchMember(dto.matchId, userId);
      if (!ok) {
        throw new ForbiddenException('You are not a member of this match');
      }
    }
  }

  async sendMessage(userId: string, dto: SendChatMessageDto) {
    //await this.assertUserCanChat(userId, dto);
    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');
       
      const saved = await this.chatRepository.insertChatMessage(client, {
        messageId: randomUUID(),
        roomId: dto.roomId ?? null,
        matchId: dto.matchId ?? null,
        userId,
        messageText: dto.messageText.trim(),
      });

      await client.query('COMMIT');

      return {
        messageId: saved.message_id,
        roomId: saved.room_id,
        matchId: saved.match_id,
        userId: saved.user_id,
        username: saved.username,
        displayName: saved.display_name,
        messageType: saved.message_type,
        messageText: saved.message_text,
        createdAt: saved.created_at,
      };
    } catch (error) {
      console.log(error);
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

  async getRecentMessages(params: { roomId?: string; matchId?: string; userId: string }) {
    const dto = {
      roomId: params.roomId,
      matchId: params.matchId,
      messageText: 'history',
    };
    console.log(params.roomId);
    await this.assertUserCanChat(params.userId, dto);

    if (params.roomId) {
      const rows = await this.chatRepository.getRecentRoomMessages(params.roomId);
      return rows.map((row) => ({
        messageId: row.message_id,
        roomId: row.room_id,
        matchId: row.match_id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        messageType: row.message_type,
        messageText: row.message_text,
        createdAt: row.created_at,
      }));
    }

    const rows = await this.chatRepository.getRecentMatchMessages(params.matchId!);
    return rows.map((row) => ({
      messageId: row.message_id,
      roomId: row.room_id,
      matchId: row.match_id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      messageType: row.message_type,
      messageText: row.message_text,
      createdAt: row.created_at,
    }));
  }
}
