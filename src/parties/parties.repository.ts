import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type PartyRow = QueryResultRow & {
  party_id: string;
  leader_user_id: string;
  invite_code: string;
  party_status: string;
  max_members: number;
  created_at: string;
  updated_at: string;
};

export type PartyMemberRow = QueryResultRow & {
  party_member_id: string;
  party_id: string;
  user_id: string;
  username: string;
  display_name: string;
  joined_at: string;
};

@Injectable()
export class PartiesRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async insertParty(
    executor: Queryable,
    params: {
      partyId: string;
      leaderUserId: string;
      inviteCode: string;
      maxMembers: number;
    },
  ): Promise<PartyRow> {
    const result = await executor.query<PartyRow>(
      `
      INSERT INTO boardgame_prod.parties (
        party_id,
        leader_user_id,
        invite_code,
        party_status,
        max_members,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING
        party_id,
        leader_user_id,
        invite_code,
        party_status,
        max_members,
        created_at,
        updated_at
      `,
      [
        params.partyId,
        params.leaderUserId,
        params.inviteCode,
        params.maxMembers,
      ],
    );

    return result.rows[0];
  }

  async insertPartyMember(
    executor: Queryable,
    params: {
      partyMemberId: string;
      partyId: string;
      userId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.party_members (
        party_member_id,
        party_id,
        user_id,
        joined_at
      )
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
      [
        params.partyMemberId,
        params.partyId,
        params.userId,
      ],
    );
  }

  async findPartyById(partyId: string): Promise<PartyRow | null> {
    const result = await this.db.query<PartyRow>(
      `
      SELECT
        party_id,
        leader_user_id,
        invite_code,
        party_status,
        max_members,
        created_at,
        updated_at
      FROM boardgame_prod.parties
      WHERE party_id = $1
      LIMIT 1
      `,
      [partyId],
    );

    return result.rows[0] ?? null;
  }

  async findPartyByInviteCode(inviteCode: string): Promise<PartyRow | null> {
    const result = await this.db.query<PartyRow>(
      `
      SELECT
        party_id,
        leader_user_id,
        invite_code,
        party_status,
        max_members,
        created_at,
        updated_at
      FROM boardgame_prod.parties
      WHERE invite_code = $1
      LIMIT 1
      `,
      [inviteCode],
    );

    return result.rows[0] ?? null;
  }

  async findPartyByUserId(userId: string): Promise<PartyRow | null> {
    const result = await this.db.query<PartyRow>(
      `
      SELECT
        p.party_id,
        p.leader_user_id,
        p.invite_code,
        p.party_status,
        p.max_members,
        p.created_at,
        p.updated_at
      FROM boardgame_prod.parties p
      JOIN boardgame_prod.party_members pm
        ON pm.party_id = p.party_id
      WHERE pm.user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async findPartyMemberByUserId(
    partyId: string,
    userId: string,
  ): Promise<PartyMemberRow | null> {
    const result = await this.db.query<PartyMemberRow>(
      `
      SELECT
        pm.party_member_id,
        pm.party_id,
        pm.user_id,
        u.username,
        u.display_name,
        pm.joined_at
      FROM boardgame_prod.party_members pm
      JOIN boardgame_prod.app_users u
        ON u.user_id = pm.user_id
      WHERE pm.party_id = $1
        AND pm.user_id = $2
      LIMIT 1
      `,
      [partyId, userId],
    );

    return result.rows[0] ?? null;
  }

  async getPartyMembers(partyId: string): Promise<PartyMemberRow[]> {
    const result = await this.db.query<PartyMemberRow>(
      `
      SELECT
        pm.party_member_id,
        pm.party_id,
        pm.user_id,
        u.username,
        u.display_name,
        pm.joined_at
      FROM boardgame_prod.party_members pm
      JOIN boardgame_prod.app_users u
        ON u.user_id = pm.user_id
      WHERE pm.party_id = $1
      ORDER BY pm.joined_at ASC
      `,
      [partyId],
    );

    return result.rows;
  }

  async getPartyMemberCount(partyId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM boardgame_prod.party_members
      WHERE party_id = $1
      `,
      [partyId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async findNextLeaderCandidate(
    partyId: string,
  ): Promise<{ user_id: string } | null> {
    const result = await this.db.query<{ user_id: string }>(
      `
      SELECT user_id
      FROM boardgame_prod.party_members
      WHERE party_id = $1
      ORDER BY joined_at ASC
      LIMIT 1
      `,
      [partyId],
    );

    return result.rows[0] ?? null;
  }

  async updatePartyLeader(
    executor: Queryable,
    partyId: string,
    leaderUserId: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.parties
      SET leader_user_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE party_id = $1
      `,
      [partyId, leaderUserId],
    );
  }

  async deletePartyMember(
    executor: Queryable,
    partyId: string,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.party_members
      WHERE party_id = $1
        AND user_id = $2
      `,
      [partyId, userId],
    );
  }

  async deletePartyMembersByPartyId(
    executor: Queryable,
    partyId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.party_members
      WHERE party_id = $1
      `,
      [partyId],
    );
  }

  async deleteParty(
    executor: Queryable,
    partyId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.parties
      WHERE party_id = $1
      `,
      [partyId],
    );
  }
}