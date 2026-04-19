import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { PasswordService } from '../common/security/password.service';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { KickRoomUserDto } from './dto/kick-room-user.dto';
import {
  RoomEventsService,
  RoomSnapshotView,
} from './room-events.service';
import { RoomsRepository } from './rooms.repository';

@Injectable()
export class RoomsService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly roomsRepository: RoomsRepository,
    private readonly passwordService: PasswordService,
    private readonly roomEventsService: RoomEventsService,
  ) {}

  private generateRoomCode(length = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < length; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }

  private findFirstAvailableSeat(occupiedSeats: number[], maxPlayers: number): number {
    const used = new Set(occupiedSeats);

    for (let seat = 1; seat <= maxPlayers; seat += 1) {
      if (!used.has(seat)) {
        return seat;
      }
    }

    throw new ConflictException('Room is full');
  }

  private toRoomResponse(room: {
    room_id: string;
    room_code: string;
    game_type_id: string;
    room_name: string;
    host_user_id: string;
    is_private: boolean;
    max_players: number;
    room_status: string;
    settings_text: string | null;
    created_at: string;
    updated_at: string;
  }, members: Array<{
    room_player_id: string;
    room_id: string;
    user_id: string;
    username: string;
    display_name: string;
    seat_no: number | null;
    is_ready: boolean;
    is_host: boolean;
    joined_at: string;
  }>): RoomSnapshotView {
    return {
      roomId: room.room_id,
      roomCode: room.room_code,
      gameTypeId: room.game_type_id,
      roomName: room.room_name,
      hostUserId: room.host_user_id,
      isPrivate: room.is_private,
      maxPlayers: room.max_players,
      roomStatus: room.room_status,
      settingsText: room.settings_text,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      members: members.map((member) => ({
        roomPlayerId: member.room_player_id,
        roomId: member.room_id,
        userId: member.user_id,
        username: member.username,
        displayName: member.display_name,
        seatNo: member.seat_no,
        isReady: member.is_ready,
        isHost: member.is_host,
        joinedAt: member.joined_at,
      })),
    };
  }

  private async getRoomSnapshotInternal(roomId: string): Promise<RoomSnapshotView | null> {
    const room = await this.roomsRepository.findRoomById(roomId);
    if (!room) {
      return null;
    }

    const members = await this.roomsRepository.getRoomMembers(roomId);
    return this.toRoomResponse(room, members);
  }

  async createRoom(userId: string, dto: CreateRoomDto) {
    const gameType = await this.roomsRepository.findGameTypeById(dto.gameTypeId);

    if (!gameType) {
      throw new NotFoundException('Game type not found');
    }

    if (dto.maxPlayers < gameType.min_players || dto.maxPlayers > gameType.max_players) {
      throw new BadRequestException(
        `maxPlayers must be between ${gameType.min_players} and ${gameType.max_players} for this game type`,
      );
    }

    const roomPasswordHash =
      dto.roomPassword && dto.roomPassword.trim()
        ? await this.passwordService.hash(dto.roomPassword.trim())
        : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client: PoolClient = await this.db.getPool().connect();

      try {
        const roomId = randomUUID();
        const roomCode = this.generateRoomCode();
        const roomPlayerId = randomUUID();

        await client.query('BEGIN');

        const room = await this.roomsRepository.insertRoom(client, {
          roomId,
          roomCode,
          gameTypeId: dto.gameTypeId,
          roomName: dto.roomName.trim(),
          hostUserId: userId,
          isPrivate: Boolean(dto.isPrivate),
          roomPasswordHash,
          maxPlayers: dto.maxPlayers,
          settingsText: dto.settingsText?.trim() || null,
        });

        await this.roomsRepository.insertRoomPlayer(client, {
          roomPlayerId,
          roomId: room.room_id,
          userId,
          seatNo: 1,
          isReady: true,
          isHost: true,
        });

        await client.query('COMMIT');

        const snapshot = await this.getRoomSnapshotInternal(room.room_id);
        if (!snapshot) {
          throw new NotFoundException('Room not found after creation');
        }

        this.roomEventsService.emitRoomSnapshot(snapshot);

        return {
          message: 'Room created successfully',
          room: snapshot,
        };
      } catch (error: any) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore
        }

        if (error?.code === '23505') {
          continue;
        }

        throw error;
      } finally {
        client.release();
      }
    }

    throw new ConflictException('Failed to generate a unique room code');
  }

  async joinRoom(userId: string, dto: JoinRoomDto) {
    const room = await this.roomsRepository.findRoomByCode(dto.roomCode);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.room_status !== 'waiting') {
      throw new ConflictException('Room is not open for joining');
    }

    const alreadyMember = await this.roomsRepository.isRoomMember(room.room_id, userId);

    if (alreadyMember) {
      const snapshot = await this.getRoomSnapshotInternal(room.room_id);
      if (!snapshot) {
        throw new NotFoundException('Room not found');
      }

      return {
        message: 'User already joined this room',
        room: snapshot,
      };
    }

    if (room.is_private && room.room_password_hash) {
      const providedPassword = dto.roomPassword?.trim();

      if (!providedPassword) {
        throw new ForbiddenException('Room password is required');
      }

      const passwordOk = await this.passwordService.verify(
        providedPassword,
        room.room_password_hash,
      );

      if (!passwordOk) {
        throw new ForbiddenException('Invalid room password');
      }
    }

    const memberCount = await this.roomsRepository.getRoomMemberCount(room.room_id);
    if (memberCount >= room.max_players) {
      throw new ConflictException('Room is full');
    }

    const occupiedSeats = await this.roomsRepository.getOccupiedSeats(room.room_id);
    const seatNo = this.findFirstAvailableSeat(occupiedSeats, room.max_players);

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.roomsRepository.insertRoomPlayer(client, {
        roomPlayerId: randomUUID(),
        roomId: room.room_id,
        userId,
        seatNo,
        isReady: false,
        isHost: false,
      });

      await client.query('COMMIT');

      const snapshot = await this.getRoomSnapshotInternal(room.room_id);
      if (!snapshot) {
        throw new NotFoundException('Room not found after join');
      }

      this.roomEventsService.emitRoomMemberJoined(room.room_id, userId);
      this.roomEventsService.emitRoomSnapshot(snapshot);

      return {
        message: 'Joined room successfully',
        room: snapshot,
      };
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }

      if (error?.code === '23505') {
        throw new ConflictException('Join conflict detected. Please try again.');
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async leaveRoom(roomId: string, userId: string) {
    const room = await this.roomsRepository.findRoomById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const member = await this.roomsRepository.findRoomPlayerByUserId(roomId, userId);
    if (!member) {
      throw new ForbiddenException('You are not a member of this room');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.roomsRepository.deleteRoomPlayer(client, roomId, userId);

      const remainingCount = await this.roomsRepository.getRoomMemberCount(roomId);

      if (remainingCount <= 0) {
        await this.roomsRepository.deleteRoom(client, roomId);
        await client.query('COMMIT');

        this.roomEventsService.emitRoomMemberLeft(roomId, userId);
        this.roomEventsService.emitRoomClosed(roomId);

        return {
          message: 'Left room successfully. Room was closed because it became empty.',
          roomClosed: true,
          roomId,
        };
      }

      if (room.host_user_id === userId) {
        const nextHost = await this.roomsRepository.findNextHostCandidate(roomId);

        if (!nextHost) {
          await this.roomsRepository.deleteRoom(client, roomId);
          await client.query('COMMIT');

          this.roomEventsService.emitRoomMemberLeft(roomId, userId);
          this.roomEventsService.emitRoomClosed(roomId);

          return {
            message: 'Left room successfully. Room was closed because it became empty.',
            roomClosed: true,
            roomId,
          };
        }

        await this.roomsRepository.clearHostFlags(client, roomId);
        await this.roomsRepository.setHostFlag(client, roomId, nextHost.user_id);
        await this.roomsRepository.updateRoomHostUserId(client, roomId, nextHost.user_id);
      }

      await client.query('COMMIT');

      const snapshot = await this.getRoomSnapshotInternal(roomId);
      if (!snapshot) {
        this.roomEventsService.emitRoomMemberLeft(roomId, userId);
        this.roomEventsService.emitRoomClosed(roomId);

        return {
          message: 'Left room successfully. Room was closed.',
          roomClosed: true,
          roomId,
        };
      }

      this.roomEventsService.emitRoomMemberLeft(roomId, userId);
      this.roomEventsService.emitRoomSnapshot(snapshot);

      return {
        message: 'Left room successfully',
        roomClosed: false,
        room: snapshot,
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

  async kickUser(roomId: string, actorUserId: string, dto: KickRoomUserDto) {
    if (actorUserId === dto.targetUserId) {
      throw new BadRequestException('Use leave room instead of kicking yourself');
    }

    const room = await this.roomsRepository.findRoomById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.host_user_id !== actorUserId) {
      throw new ForbiddenException('Only the host can kick users');
    }

    const actorMember = await this.roomsRepository.findRoomPlayerByUserId(roomId, actorUserId);
    if (!actorMember) {
      throw new ForbiddenException('You are not a member of this room');
    }

    const targetMember = await this.roomsRepository.findRoomPlayerByUserId(
      roomId,
      dto.targetUserId,
    );

    if (!targetMember) {
      throw new NotFoundException('Target user is not in this room');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.roomsRepository.deleteRoomPlayer(client, roomId, dto.targetUserId);

      await client.query('COMMIT');

      const snapshot = await this.getRoomSnapshotInternal(roomId);
      if (!snapshot) {
        this.roomEventsService.emitRoomMemberKicked(
          roomId,
          dto.targetUserId,
          actorUserId,
        );
        this.roomEventsService.emitRoomClosed(roomId);

        return {
          message: 'User kicked successfully. Room was closed.',
          roomClosed: true,
          roomId,
        };
      }

      this.roomEventsService.emitRoomMemberKicked(
        roomId,
        dto.targetUserId,
        actorUserId,
      );
      this.roomEventsService.emitRoomSnapshot(snapshot);

      return {
        message: 'User kicked successfully',
        room: snapshot,
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

  async getRoom(roomId: string, userId: string) {
    const room = await this.roomsRepository.findRoomById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const isMember = await this.roomsRepository.isRoomMember(roomId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this room');
    }

    const members = await this.roomsRepository.getRoomMembers(roomId);

    return {
      room: this.toRoomResponse(room, members),
    };
  }
}
