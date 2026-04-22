import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type ActiveRoomMembershipRow = QueryResultRow & {
  active_room_membership_id: string;
  user_id: string;
  room_id: string;
  created_at: string;
};

export type ActiveMatchMembershipRow = QueryResultRow & {
  active_match_membership_id: string;
  user_id: string;
  match_id: string;
  created_at: string;
};

@Injectable()
export class ParticipationRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async findActiveRoomMembershipByUserId(
    userId: string,
  ): Promise<ActiveRoomMembershipRow | null> {
    const result = await this.db.query<ActiveRoomMembershipRow>(
      `
      SELECT
        active_room_membership_id,
        user_id,
        room_id,
        created_at
      FROM boardgame_prod.active_room_memberships
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async findActiveMatchMembershipByUserId(
    userId: string,
  ): Promise<ActiveMatchMembershipRow | null> {
    const result = await this.db.query<ActiveMatchMembershipRow>(
      `
      SELECT
        active_match_membership_id,
        user_id,
        match_id,
        created_at
      FROM boardgame_prod.active_match_memberships
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async createActiveRoomMembership(
    executor: Queryable,
    params: {
      activeRoomMembershipId: string;
      userId: string;
      roomId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.active_room_memberships (
        active_room_membership_id,
        user_id,
        room_id,
        created_at
      )
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
      [
        params.activeRoomMembershipId,
        params.userId,
        params.roomId,
      ],
    );
  }

  async deleteActiveRoomMembershipForUser(
    executor: Queryable,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.active_room_memberships
      WHERE user_id = $1
      `,
      [userId],
    );
  }

  async deleteActiveRoomMembershipsForRoom(
    executor: Queryable,
    roomId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.active_room_memberships
      WHERE room_id = $1
      `,
      [roomId],
    );
  }

  async createActiveMatchMembership(
    executor: Queryable,
    params: {
      activeMatchMembershipId: string;
      userId: string;
      matchId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.active_match_memberships (
        active_match_membership_id,
        user_id,
        match_id,
        created_at
      )
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
      [
        params.activeMatchMembershipId,
        params.userId,
        params.matchId,
      ],
    );
  }

  async deleteActiveMatchMembershipForUser(
    executor: Queryable,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.active_match_memberships
      WHERE user_id = $1
      `,
      [userId],
    );
  }

  async deleteActiveMatchMembershipsForMatch(
    executor: Queryable,
    matchId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.active_match_memberships
      WHERE match_id = $1
      `,
      [matchId],
    );
  }
}