import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

type Queryable = Pick<PoolClient, 'query'>;

export type MatchmakingTicketRow = QueryResultRow & {
  ticket_id: string;
  party_id: string | null;
  queue_group_key: string;
  game_type_id: string;
  team_size: number;
  ticket_status: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type MatchmakingTicketSummaryRow = MatchmakingTicketRow & {
  member_count: string;
};

export type MatchmakingTicketMemberRow = QueryResultRow & {
  ticket_member_id: string;
  ticket_id: string;
  user_id: string;
  username: string;
  display_name: string;
  joined_at: string;
};

export type ProposedMatchRow = QueryResultRow & {
  proposed_match_id: string;
  game_type_id: string;
  team_size: number;
  proposed_status: string;
  accept_deadline_at: string;
  created_at: string;
};

export type ProposedMatchEntryRow = QueryResultRow & {
  proposed_match_entry_id: string;
  proposed_match_id: string;
  team_no: number;
  ticket_id: string;
  party_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  response_status: string;
  responded_at: string | null;
};

@Injectable()
export class MatchmakingRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async findActiveTicketByUserId(
    userId: string,
  ): Promise<MatchmakingTicketRow | null> {
    const result = await this.db.query<MatchmakingTicketRow>(
      `
      SELECT
        t.ticket_id,
        t.party_id,
        t.queue_group_key,
        t.game_type_id,
        t.team_size,
        t.ticket_status,
        t.created_by_user_id,
        t.created_at,
        t.updated_at
      FROM boardgame_prod.matchmaking_tickets t
      JOIN boardgame_prod.matchmaking_ticket_members tm
        ON tm.ticket_id = t.ticket_id
      WHERE tm.user_id = $1
        AND t.ticket_status IN ('queued', 'reserved')
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async findTicketById(ticketId: string): Promise<MatchmakingTicketRow | null> {
    const result = await this.db.query<MatchmakingTicketRow>(
      `
      SELECT
        ticket_id,
        party_id,
        queue_group_key,
        game_type_id,
        team_size,
        ticket_status,
        created_by_user_id,
        created_at,
        updated_at
      FROM boardgame_prod.matchmaking_tickets
      WHERE ticket_id = $1
      LIMIT 1
      `,
      [ticketId],
    );

    return result.rows[0] ?? null;
  }

  async listQueuedTicketSummaries(
    gameTypeId: string,
    teamSize: number,
  ): Promise<MatchmakingTicketSummaryRow[]> {
    const result = await this.db.query<MatchmakingTicketSummaryRow>(
      `
      SELECT
        t.ticket_id,
        t.party_id,
        t.queue_group_key,
        t.game_type_id,
        t.team_size,
        t.ticket_status,
        t.created_by_user_id,
        t.created_at,
        t.updated_at,
        COUNT(tm.user_id)::text AS member_count
      FROM boardgame_prod.matchmaking_tickets t
      JOIN boardgame_prod.matchmaking_ticket_members tm
        ON tm.ticket_id = t.ticket_id
      WHERE t.game_type_id = $1
        AND t.team_size = $2
        AND t.ticket_status = 'queued'
      GROUP BY
        t.ticket_id,
        t.party_id,
        t.queue_group_key,
        t.game_type_id,
        t.team_size,
        t.ticket_status,
        t.created_by_user_id,
        t.created_at,
        t.updated_at
      ORDER BY t.created_at ASC
      `,
      [gameTypeId, teamSize],
    );

    return result.rows;
  }

  async getTicketMembers(ticketId: string): Promise<MatchmakingTicketMemberRow[]> {
    const result = await this.db.query<MatchmakingTicketMemberRow>(
      `
      SELECT
        tm.ticket_member_id,
        tm.ticket_id,
        tm.user_id,
        u.username,
        u.display_name,
        tm.joined_at
      FROM boardgame_prod.matchmaking_ticket_members tm
      JOIN boardgame_prod.app_users u
        ON u.user_id = tm.user_id
      WHERE tm.ticket_id = $1
      ORDER BY tm.joined_at ASC
      `,
      [ticketId],
    );

    return result.rows;
  }

  async insertTicket(
    executor: Queryable,
    params: {
      ticketId: string;
      partyId: string | null;
      queueGroupKey: string;
      gameTypeId: string;
      teamSize: number;
      createdByUserId: string;
    },
  ): Promise<MatchmakingTicketRow> {
    const result = await executor.query<MatchmakingTicketRow>(
      `
      INSERT INTO boardgame_prod.matchmaking_tickets (
        ticket_id,
        party_id,
        queue_group_key,
        game_type_id,
        team_size,
        ticket_status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, 'queued', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING
        ticket_id,
        party_id,
        queue_group_key,
        game_type_id,
        team_size,
        ticket_status,
        created_by_user_id,
        created_at,
        updated_at
      `,
      [
        params.ticketId,
        params.partyId,
        params.queueGroupKey,
        params.gameTypeId,
        params.teamSize,
        params.createdByUserId,
      ],
    );

    return result.rows[0];
  }

  async insertTicketMember(
    executor: Queryable,
    params: {
      ticketMemberId: string;
      ticketId: string;
      userId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.matchmaking_ticket_members (
        ticket_member_id,
        ticket_id,
        user_id,
        joined_at
      )
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
      [params.ticketMemberId, params.ticketId, params.userId],
    );
  }

  async updateTicketStatus(
    executor: Queryable,
    ticketId: string,
    ticketStatus: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.matchmaking_tickets
      SET ticket_status = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE ticket_id = $1
      `,
      [ticketId, ticketStatus],
    );
  }

  async deleteTicketMembersByTicketId(
    executor: Queryable,
    ticketId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.matchmaking_ticket_members
      WHERE ticket_id = $1
      `,
      [ticketId],
    );
  }

  async deleteTicket(
    executor: Queryable,
    ticketId: string,
  ): Promise<void> {
    await executor.query(
      `
      DELETE FROM boardgame_prod.matchmaking_tickets
      WHERE ticket_id = $1
      `,
      [ticketId],
    );
  }

  async insertProposedMatch(
    executor: Queryable,
    params: {
      proposedMatchId: string;
      gameTypeId: string;
      teamSize: number;
      acceptDeadlineAt: Date;
    },
  ): Promise<ProposedMatchRow> {
    const result = await executor.query<ProposedMatchRow>(
      `
      INSERT INTO boardgame_prod.proposed_matches (
        proposed_match_id,
        game_type_id,
        team_size,
        proposed_status,
        accept_deadline_at,
        created_at
      )
      VALUES (
        $1, $2, $3, 'waiting_accept', $4, CURRENT_TIMESTAMP
      )
      RETURNING
        proposed_match_id,
        game_type_id,
        team_size,
        proposed_status,
        accept_deadline_at,
        created_at
      `,
      [
        params.proposedMatchId,
        params.gameTypeId,
        params.teamSize,
        params.acceptDeadlineAt,
      ],
    );

    return result.rows[0];
  }

  async findProposedMatchById(
    proposedMatchId: string,
  ): Promise<ProposedMatchRow | null> {
    const result = await this.db.query<ProposedMatchRow>(
      `
      SELECT
        proposed_match_id,
        game_type_id,
        team_size,
        proposed_status,
        accept_deadline_at,
        created_at
      FROM boardgame_prod.proposed_matches
      WHERE proposed_match_id = $1
      LIMIT 1
      `,
      [proposedMatchId],
    );

    return result.rows[0] ?? null;
  }

  async findWaitingProposedMatchByUserId(
    userId: string,
  ): Promise<ProposedMatchRow | null> {
    const result = await this.db.query<ProposedMatchRow>(
      `
      SELECT
        pm.proposed_match_id,
        pm.game_type_id,
        pm.team_size,
        pm.proposed_status,
        pm.accept_deadline_at,
        pm.created_at
      FROM boardgame_prod.proposed_matches pm
      JOIN boardgame_prod.proposed_match_entries pme
        ON pme.proposed_match_id = pm.proposed_match_id
      WHERE pme.user_id = $1
        AND pm.proposed_status = 'waiting_accept'
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async listExpiredWaitingProposedMatches(limit = 20): Promise<ProposedMatchRow[]> {
    const result = await this.db.query<ProposedMatchRow>(
      `
      SELECT
        proposed_match_id,
        game_type_id,
        team_size,
        proposed_status,
        accept_deadline_at,
        created_at
      FROM boardgame_prod.proposed_matches
      WHERE proposed_status = 'waiting_accept'
        AND accept_deadline_at <= CURRENT_TIMESTAMP
      ORDER BY accept_deadline_at ASC
      LIMIT $1
      `,
      [limit],
    );

    return result.rows;
  }

  async insertProposedMatchEntry(
    executor: Queryable,
    params: {
      proposedMatchEntryId: string;
      proposedMatchId: string;
      teamNo: number;
      ticketId: string;
      partyId: string | null;
      userId: string;
    },
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.proposed_match_entries (
        proposed_match_entry_id,
        proposed_match_id,
        team_no,
        ticket_id,
        party_id,
        user_id,
        response_status,
        responded_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'pending', NULL
      )
      `,
      [
        params.proposedMatchEntryId,
        params.proposedMatchId,
        params.teamNo,
        params.ticketId,
        params.partyId,
        params.userId,
      ],
    );
  }

  async getProposedMatchEntries(
    proposedMatchId: string,
  ): Promise<ProposedMatchEntryRow[]> {
    const result = await this.db.query<ProposedMatchEntryRow>(
      `
      SELECT
        pme.proposed_match_entry_id,
        pme.proposed_match_id,
        pme.team_no,
        pme.ticket_id,
        pme.party_id,
        pme.user_id,
        u.username,
        u.display_name,
        pme.response_status,
        pme.responded_at
      FROM boardgame_prod.proposed_match_entries pme
      JOIN boardgame_prod.app_users u
        ON u.user_id = pme.user_id
      WHERE pme.proposed_match_id = $1
      ORDER BY pme.team_no ASC, pme.user_id ASC
      `,
      [proposedMatchId],
    );

    return result.rows;
  }

  async updateProposedMatchStatus(
    executor: Queryable,
    proposedMatchId: string,
    proposedStatus: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.proposed_matches
      SET proposed_status = $2
      WHERE proposed_match_id = $1
      `,
      [proposedMatchId, proposedStatus],
    );
  }

  async updateEntryResponseForUser(
    executor: Queryable,
    proposedMatchId: string,
    userId: string,
    responseStatus: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.proposed_match_entries
      SET response_status = $3,
          responded_at = CURRENT_TIMESTAMP
      WHERE proposed_match_id = $1
        AND user_id = $2
      `,
      [proposedMatchId, userId, responseStatus],
    );
  }

  async updateEntryResponseForTicket(
    executor: Queryable,
    proposedMatchId: string,
    ticketId: string,
    responseStatus: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.proposed_match_entries
      SET response_status = $3,
          responded_at = CURRENT_TIMESTAMP
      WHERE proposed_match_id = $1
        AND ticket_id = $2
      `,
      [proposedMatchId, ticketId, responseStatus],
    );
  }

  async markPendingEntriesTimedOut(
    executor: Queryable,
    proposedMatchId: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.proposed_match_entries
      SET response_status = 'timed_out',
          responded_at = CURRENT_TIMESTAMP
      WHERE proposed_match_id = $1
        AND response_status = 'pending'
      `,
      [proposedMatchId],
    );
  }
}