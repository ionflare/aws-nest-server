import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { ParticipationRepository } from './participation.repository';

@Injectable()
export class ParticipationService {
  constructor(
    private readonly participationRepository: ParticipationRepository,
  ) {}

  async assertCanEnterRoom(userId: string, targetRoomId?: string): Promise<void> {
    const [activeRoom, activeMatch] = await Promise.all([
      this.participationRepository.findActiveRoomMembershipByUserId(userId),
      this.participationRepository.findActiveMatchMembershipByUserId(userId),
    ]);

    if (activeMatch) {
      throw new ConflictException(
        'User is already in an active match and cannot join another room',
      );
    }

    if (activeRoom && activeRoom.room_id !== targetRoomId) {
      throw new ConflictException(
        'User is already in another active room',
      );
    }
  }

  async assertUsersCanStartMatch(
    userIds: string[],
    roomId: string,
  ): Promise<void> {
    const checks = await Promise.all(
      userIds.map(async (userId) => {
        const [activeRoom, activeMatch] = await Promise.all([
          this.participationRepository.findActiveRoomMembershipByUserId(userId),
          this.participationRepository.findActiveMatchMembershipByUserId(userId),
        ]);

        return {
          userId,
          activeRoom,
          activeMatch,
        };
      }),
    );

    for (const check of checks) {
      if (check.activeMatch) {
        throw new ConflictException(
          `User ${check.userId} is already in another active match`,
        );
      }

      if (!check.activeRoom || check.activeRoom.room_id !== roomId) {
        throw new ConflictException(
          `User ${check.userId} is not locked to this room`,
        );
      }
    }
  }

  async acquireRoomMembership(
    executor: Pick<PoolClient, 'query'>,
    userId: string,
    roomId: string,
  ): Promise<void> {
    await this.participationRepository.createActiveRoomMembership(executor, {
      activeRoomMembershipId: randomUUID(),
      userId,
      roomId,
    });
  }

  async releaseRoomMembershipForUser(
    executor: Pick<PoolClient, 'query'>,
    userId: string,
  ): Promise<void> {
    await this.participationRepository.deleteActiveRoomMembershipForUser(
      executor,
      userId,
    );
  }

  async releaseRoomMembershipsForRoom(
    executor: Pick<PoolClient, 'query'>,
    roomId: string,
  ): Promise<void> {
    await this.participationRepository.deleteActiveRoomMembershipsForRoom(
      executor,
      roomId,
    );
  }

  async acquireMatchMembership(
    executor: Pick<PoolClient, 'query'>,
    userId: string,
    matchId: string,
  ): Promise<void> {
    await this.participationRepository.createActiveMatchMembership(executor, {
      activeMatchMembershipId: randomUUID(),
      userId,
      matchId,
    });
  }

  async releaseMatchMembershipForUser(
    executor: Pick<PoolClient, 'query'>,
    userId: string,
  ): Promise<void> {
    await this.participationRepository.deleteActiveMatchMembershipForUser(
      executor,
      userId,
    );
  }

  async releaseMatchMembershipsForMatch(
    executor: Pick<PoolClient, 'query'>,
    matchId: string,
  ): Promise<void> {
    await this.participationRepository.deleteActiveMatchMembershipsForMatch(
      executor,
      matchId,
    );
  }
}