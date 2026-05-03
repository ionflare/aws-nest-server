import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { PartiesService } from '../parties/parties.service';
import { ParticipationService } from '../participation/participation.service';
import { AcceptProposedMatchDto } from './dto/accept-proposed-match.dto';
import { EnqueueMatchmakingDto } from './dto/enqueue-matchmaking.dto';
import { RejectProposedMatchDto } from './dto/reject-proposed-match.dto';
import {
    MatchmakingRepository,
    MatchmakingTicketSummaryRow,
    ProposedMatchEntryRow,
    ProposedMatchRow,
} from './matchmaking.repository';
import { MatchesService } from 'src/matches/matches.service';
import { MatchmakingEventsService } from './matchmaking-events.service';

type QueueMember = {
    userId: string;
};

type QueueGroup = {
    partyId: string | null;
    queueGroupKey: string;
    createdByUserId: string;
    members: QueueMember[];
};

type TicketCandidate = MatchmakingTicketSummaryRow & {
    memberCount: number;
};

@Injectable()
export class MatchmakingService {
    constructor(
        private readonly db: AuroraDsqlService,
        private readonly partiesService: PartiesService,
        private readonly participationService: ParticipationService,
        private readonly matchmakingRepository: MatchmakingRepository,
        private readonly matchesService: MatchesService,
        private readonly matchmakingEventsService: MatchmakingEventsService,
    ) { }

    private toProposedMatchResponse(
        proposedMatch: ProposedMatchRow,
        entries: ProposedMatchEntryRow[],
    ) {
        return {
            proposedMatchId: proposedMatch.proposed_match_id,
            gameTypeId: proposedMatch.game_type_id,
            teamSize: proposedMatch.team_size,
            proposedStatus: proposedMatch.proposed_status,
            acceptDeadlineAt: proposedMatch.accept_deadline_at,
            teams: [1, 2].map((teamNo) => ({
                teamNo,
                players: entries
                    .filter((entry) => entry.team_no === teamNo)
                    .map((entry) => ({
                        userId: entry.user_id,
                        username: entry.username,
                        displayName: entry.display_name,
                        ticketId: entry.ticket_id,
                        partyId: entry.party_id,
                        responseStatus: entry.response_status,
                        respondedAt: entry.responded_at,
                    })),
            })),
        };
    }

    private async ensureMembersAreFree(members: QueueMember[]) {
        const contexts = await Promise.all(
            members.map((member) =>
                this.participationService.getResumeContext(member.userId),
            ),
        );

        for (const context of contexts) {
            if (context.activeMatchId) {
                throw new ConflictException(
                    'One or more users are already in an active match',
                );
            }

            if (context.activeRoomId) {
                throw new ConflictException(
                    'One or more users are already in an active room',
                );
            }
        }
    }

    private async resolveQueueGroupForActor(userId: string): Promise<QueueGroup> {
        const currentPartyResult = await this.partiesService.getCurrentParty(userId);
        const currentParty = currentPartyResult.party;

        if (!currentParty) {
            return {
                partyId: null,
                queueGroupKey: `solo:${userId}`,
                createdByUserId: userId,
                members: [{ userId }],
            };
        }

        if (currentParty.leaderUserId !== userId) {
            throw new ForbiddenException('Only the party leader can queue the party');
        }

        return {
            partyId: currentParty.partyId,
            queueGroupKey: `party:${currentParty.partyId}`,
            createdByUserId: userId,
            members: currentParty.members.map((member) => ({
                userId: member.userId,
            })),
        };
    }

    private findSubset(
        tickets: TicketCandidate[],
        targetSize: number,
        startIndex = 0,
        chosen: TicketCandidate[] = [],
        currentSize = 0,
    ): TicketCandidate[] | null {
        if (currentSize === targetSize) {
            return chosen;
        }

        if (currentSize > targetSize) {
            return null;
        }

        for (let i = startIndex; i < tickets.length; i += 1) {
            const ticket = tickets[i];
            const result = this.findSubset(
                tickets,
                targetSize,
                i + 1,
                [...chosen, ticket],
                currentSize + ticket.memberCount,
            );

            if (result) {
                return result;
            }
        }

        return null;
    }

    private buildTwoTeams(
        ticketSummaries: TicketCandidate[],
        teamSize: number,
    ): { team1: TicketCandidate[]; team2: TicketCandidate[] } | null {
        const sorted = [...ticketSummaries].sort((a, b) => {
            const aCreatedAt = new Date(a.created_at).getTime();
            const bCreatedAt = new Date(b.created_at).getTime();

            if (aCreatedAt !== bCreatedAt) {
                return aCreatedAt - bCreatedAt;
            }

            return b.memberCount - a.memberCount;
        });

        const n = sorted.length;

        const searchTeam1 = (
            startIndex = 0,
            chosen: TicketCandidate[] = [],
            currentSize = 0,
        ): { team1: TicketCandidate[]; team2: TicketCandidate[] } | null => {
            if (currentSize === teamSize) {
                const chosenIds = new Set(chosen.map((ticket) => ticket.ticket_id));
                const remaining = sorted.filter((ticket) => !chosenIds.has(ticket.ticket_id));
                const team2 = this.findSubset(remaining, teamSize);

                if (team2) {
                    return {
                        team1: chosen,
                        team2,
                    };
                }

                return null;
            }

            if (currentSize > teamSize) {
                return null;
            }

            for (let i = startIndex; i < n; i += 1) {
                const ticket = sorted[i];
                const result = searchTeam1(
                    i + 1,
                    [...chosen, ticket],
                    currentSize + ticket.memberCount,
                );

                if (result) {
                    return result;
                }
            }

            return null;
        };

        return searchTeam1();
    }

    private async tryCreateProposedMatch(
        gameTypeId: string,
        teamSize: number,
        acceptTimeoutSec: number,
    ) {
        const queued = await this.matchmakingRepository.listQueuedTicketSummaries(
            gameTypeId,
            teamSize,
        );

        const candidates: TicketCandidate[] = queued.map((ticket) => ({
            ...ticket,
            memberCount: Number(ticket.member_count),
        }));

        const builtTeams = this.buildTwoTeams(candidates, teamSize);
        if (!builtTeams) {
            return null;
        }

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            const proposedMatch = await this.matchmakingRepository.insertProposedMatch(client, {
                proposedMatchId: randomUUID(),
                gameTypeId,
                teamSize,
                acceptDeadlineAt: new Date(Date.now() + acceptTimeoutSec * 1000),
            });

            const allSelectedTickets = [...builtTeams.team1, ...builtTeams.team2];

            for (const ticket of allSelectedTickets) {
                await this.matchmakingRepository.updateTicketStatus(
                    client,
                    ticket.ticket_id,
                    'reserved',
                );
            }

            for (const ticket of builtTeams.team1) {
                const members = await this.matchmakingRepository.getTicketMembers(ticket.ticket_id);

                for (const member of members) {
                    await this.matchmakingRepository.insertProposedMatchEntry(client, {
                        proposedMatchEntryId: randomUUID(),
                        proposedMatchId: proposedMatch.proposed_match_id,
                        teamNo: 1,
                        ticketId: ticket.ticket_id,
                        partyId: ticket.party_id,
                        userId: member.user_id,
                    });
                }
            }

            for (const ticket of builtTeams.team2) {
                const members = await this.matchmakingRepository.getTicketMembers(ticket.ticket_id);

                for (const member of members) {
                    await this.matchmakingRepository.insertProposedMatchEntry(client, {
                        proposedMatchEntryId: randomUUID(),
                        proposedMatchId: proposedMatch.proposed_match_id,
                        teamNo: 2,
                        ticketId: ticket.ticket_id,
                        partyId: ticket.party_id,
                        userId: member.user_id,
                    });
                }
            }

            await client.query('COMMIT');

            const entries = await this.matchmakingRepository.getProposedMatchEntries(
                proposedMatch.proposed_match_id,
            );

            const notifiedUserIds = [...new Set(entries.map((entry) => entry.user_id))];
            this.matchmakingEventsService.emitProposedMatchFound(
                notifiedUserIds,
                proposedMatch.proposed_match_id,
            );

            return this.toProposedMatchResponse(proposedMatch, entries);
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

    private async failProposedMatch(
        proposedMatchId: string,
        failingTicketIds: string[],
    ) {
        const proposedMatch =
            await this.matchmakingRepository.findProposedMatchById(proposedMatchId);

        if (!proposedMatch) {
            return null;
        }

        const entries =
            await this.matchmakingRepository.getProposedMatchEntries(proposedMatchId);

        const involvedTicketIds = [...new Set(entries.map((entry) => entry.ticket_id))];
        const failingSet = new Set(failingTicketIds);
        const survivors = involvedTicketIds.filter((ticketId) => !failingSet.has(ticketId));

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            await this.matchmakingRepository.updateProposedMatchStatus(
                client,
                proposedMatchId,
                'failed',
            );

            for (const ticketId of survivors) {
                await this.matchmakingRepository.updateTicketStatus(client, ticketId, 'queued');
            }

            for (const ticketId of failingTicketIds) {
                await this.matchmakingRepository.deleteTicketMembersByTicketId(client, ticketId);
                await this.matchmakingRepository.deleteTicket(client, ticketId);
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

        const affectedUserIds = [...new Set(entries.map((entry) => entry.user_id))];
        this.matchmakingEventsService.emitProposedMatchFailed(
            affectedUserIds,
            proposedMatchId,
        );

        await this.tryCreateProposedMatch(
            proposedMatch.game_type_id,
            proposedMatch.team_size,
            20,
        );

        return {
            message: 'Proposed match failed',
            proposedMatchId,
        };
    }

    async enqueue(userId: string, dto: EnqueueMatchmakingDto) {
        const activeTicket =
            await this.matchmakingRepository.findActiveTicketByUserId(userId);

        if (activeTicket) {
            throw new ConflictException('User already has an active matchmaking ticket');
        }

        const queueGroup = await this.resolveQueueGroupForActor(userId);
        await this.ensureMembersAreFree(queueGroup.members);

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            const ticket = await this.matchmakingRepository.insertTicket(client, {
                ticketId: randomUUID(),
                partyId: queueGroup.partyId,
                queueGroupKey: queueGroup.queueGroupKey,
                gameTypeId: dto.gameTypeId,
                teamSize: dto.teamSize,
                createdByUserId: queueGroup.createdByUserId,
            });

            for (const member of queueGroup.members) {
                await this.matchmakingRepository.insertTicketMember(client, {
                    ticketMemberId: randomUUID(),
                    ticketId: ticket.ticket_id,
                    userId: member.userId,
                });
            }

            await client.query('COMMIT');

            const proposedMatch = await this.tryCreateProposedMatch(
                dto.gameTypeId,
                dto.teamSize,
                dto.acceptTimeoutSec ?? 20,
            );

            return {
                message: 'Queued successfully',
                ticketId: ticket.ticket_id,
                proposedMatch,
            };
        } catch (error: any) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore
            }

            if (error?.code === '23505') {
                throw new ConflictException(
                    'One or more users are already in another active queue ticket',
                );
            }

            throw error;
        } finally {
            client.release();
        }
    }

    async getCurrent(userId: string) {
        const ticket = await this.matchmakingRepository.findActiveTicketByUserId(userId);
        const proposedMatch =
            await this.matchmakingRepository.findWaitingProposedMatchByUserId(userId);

        let proposedMatchView: | ReturnType<MatchmakingService['toProposedMatchResponse']> | null = null;

        if (proposedMatch) {
            const entries =
                await this.matchmakingRepository.getProposedMatchEntries(
                    proposedMatch.proposed_match_id,
                );

            proposedMatchView = this.toProposedMatchResponse(proposedMatch, entries);
        }

        return {
            ticket: ticket
                ? {
                    ticketId: ticket.ticket_id,
                    partyId: ticket.party_id,
                    gameTypeId: ticket.game_type_id,
                    teamSize: ticket.team_size,
                    ticketStatus: ticket.ticket_status,
                    createdAt: ticket.created_at,
                }
                : null,
            proposedMatch: proposedMatchView,
        };
    }

    async cancelQueue(userId: string) {
        const ticket = await this.matchmakingRepository.findActiveTicketByUserId(userId);

        if (!ticket) {
            throw new NotFoundException('Queue ticket not found');
        }

        if (ticket.party_id) {
            const currentParty = await this.partiesService.getCurrentParty(userId);

            if (!currentParty.party || currentParty.party.leaderUserId !== userId) {
                throw new ForbiddenException('Only the party leader can cancel the party queue');
            }
        }

        const waitingProposedMatch =
            await this.matchmakingRepository.findWaitingProposedMatchByUserId(userId);

        if (waitingProposedMatch) {
            return this.rejectProposedMatch(userId, {
                proposedMatchId: waitingProposedMatch.proposed_match_id,
            });
        }

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            await this.matchmakingRepository.deleteTicketMembersByTicketId(
                client,
                ticket.ticket_id,
            );
            await this.matchmakingRepository.deleteTicket(client, ticket.ticket_id);

            await client.query('COMMIT');

            return {
                message: 'Queue cancelled successfully',
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

    async acceptProposedMatch(userId: string, dto: AcceptProposedMatchDto) {
        const proposedMatch =
            await this.matchmakingRepository.findProposedMatchById(dto.proposedMatchId);

        if (!proposedMatch) {
            throw new NotFoundException('Proposed match not found');
        }

        if (proposedMatch.proposed_status !== 'waiting_accept') {
            throw new ConflictException('Proposed match is no longer accepting responses');
        }

        const entries =
            await this.matchmakingRepository.getProposedMatchEntries(dto.proposedMatchId);

        const myEntry = entries.find((entry) => entry.user_id === userId);
        if (!myEntry) {
            throw new ForbiddenException('You are not part of this proposed match');
        }

        if (myEntry.response_status === 'rejected' || myEntry.response_status === 'timed_out') {
            throw new ConflictException('Your ticket already failed this proposal');
        }

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            await this.matchmakingRepository.updateEntryResponseForUser(
                client,
                dto.proposedMatchId,
                userId,
                'accepted',
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

        const refreshedEntries =
            await this.matchmakingRepository.getProposedMatchEntries(dto.proposedMatchId);

        const everyoneAccepted = refreshedEntries.every(
            (entry) => entry.response_status === 'accepted',
        );

        if (!everyoneAccepted) {
            return {
                message: 'Accepted proposed match',
                confirmed: false,
                matchId: null,
                proposedMatch: this.toProposedMatchResponse(proposedMatch, refreshedEntries),
            };
        }

        const involvedTicketIds = [...new Set(refreshedEntries.map((entry) => entry.ticket_id))];

        const matchResult = await this.matchesService.createDirectMatch({
            gameTypeId: proposedMatch.game_type_id,
            players: this.toDirectMatchPlayers(refreshedEntries),
            startedByUserId: userId,
            roomId: null,
        });

        const client2: PoolClient = await this.db.getPool().connect();

        try {
            await client2.query('BEGIN');

            await this.matchmakingRepository.updateProposedMatchStatus(
                client2,
                dto.proposedMatchId,
                'confirmed',
            );

            for (const ticketId of involvedTicketIds) {
                await this.matchmakingRepository.deleteTicketMembersByTicketId(client2, ticketId);
                await this.matchmakingRepository.deleteTicket(client2, ticketId);
            }

            await client2.query('COMMIT');
        } catch (error) {
            try {
                await client2.query('ROLLBACK');
            } catch {
                // ignore
            }
            throw error;
        } finally {
            client2.release();
        }

        const confirmedUserIds = [
            ...new Set(refreshedEntries.map((entry) => entry.user_id)),
        ];

        this.matchmakingEventsService.emitMatchConfirmed(
            confirmedUserIds,
            dto.proposedMatchId,
            matchResult.matchId,
        );

        return {
            message: 'Proposed match confirmed',
            confirmed: true,
            matchId: matchResult.matchId,
            proposedMatch: this.toProposedMatchResponse(proposedMatch, refreshedEntries),
        };
    }
    async rejectProposedMatch(userId: string, dto: RejectProposedMatchDto) {
        const proposedMatch =
            await this.matchmakingRepository.findProposedMatchById(dto.proposedMatchId);

        if (!proposedMatch) {
            throw new NotFoundException('Proposed match not found');
        }

        if (proposedMatch.proposed_status !== 'waiting_accept') {
            throw new ConflictException('Proposed match is no longer accepting responses');
        }

        const entries =
            await this.matchmakingRepository.getProposedMatchEntries(dto.proposedMatchId);

        const myEntry = entries.find((entry) => entry.user_id === userId);
        if (!myEntry) {
            throw new ForbiddenException('You are not part of this proposed match');
        }

        const client: PoolClient = await this.db.getPool().connect();

        try {
            await client.query('BEGIN');

            await this.matchmakingRepository.updateEntryResponseForTicket(
                client,
                dto.proposedMatchId,
                myEntry.ticket_id,
                'rejected',
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

        return this.failProposedMatch(dto.proposedMatchId, [myEntry.ticket_id]);
    }

    async resolveExpiredProposedMatches(limit = 20) {
        const expired =
            await this.matchmakingRepository.listExpiredWaitingProposedMatches(limit);

        for (const proposedMatch of expired) {
            const entries =
                await this.matchmakingRepository.getProposedMatchEntries(
                    proposedMatch.proposed_match_id,
                );

            const timedOutTicketIds = [
                ...new Set(
                    entries
                        .filter((entry) => entry.response_status === 'pending')
                        .map((entry) => entry.ticket_id),
                ),
            ];

            if (timedOutTicketIds.length === 0) {
                continue;
            }

            const client: PoolClient = await this.db.getPool().connect();

            try {
                await client.query('BEGIN');

                await this.matchmakingRepository.markPendingEntriesTimedOut(
                    client,
                    proposedMatch.proposed_match_id,
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

            await this.failProposedMatch(proposedMatch.proposed_match_id, timedOutTicketIds);
        }
    }

    private toDirectMatchPlayers(entries: ProposedMatchEntryRow[]) {
        const ordered = [...entries].sort((a, b) => {
            if (a.team_no !== b.team_no) {
                return a.team_no - b.team_no;
            }

            return a.user_id.localeCompare(b.user_id);
        });

        return ordered.map((entry, index) => ({
            userId: entry.user_id,
            seatNo: index + 1,
        }));
    }
}
