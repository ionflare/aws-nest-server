import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { JoinPartyByCodeDto } from './dto/join-party-by-code.dto';
import { KickPartyMemberDto } from './dto/kick-party-member.dto';
import { PartiesRepository, PartyMemberRow, PartyRow } from './parties.repository';

@Injectable()
export class PartiesService {
  private readonly DEFAULT_MAX_PARTY_MEMBERS = 5;

  constructor(
    private readonly db: AuroraDsqlService,
    private readonly partiesRepository: PartiesRepository,
  ) {}

  private generateInviteCode(length = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < length; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }

  private toPartyResponse(party: PartyRow, members: PartyMemberRow[]) {
    return {
      partyId: party.party_id,
      leaderUserId: party.leader_user_id,
      inviteCode: party.invite_code,
      partyStatus: party.party_status,
      maxMembers: party.max_members,
      createdAt: party.created_at,
      updatedAt: party.updated_at,
      members: members.map((member) => ({
        partyMemberId: member.party_member_id,
        partyId: member.party_id,
        userId: member.user_id,
        username: member.username,
        displayName: member.display_name,
        joinedAt: member.joined_at,
        isLeader: member.user_id === party.leader_user_id,
      })),
    };
  }

  private async getPartySnapshot(partyId: string) {
    const party = await this.partiesRepository.findPartyById(partyId);
    if (!party) {
      return null;
    }

    const members = await this.partiesRepository.getPartyMembers(partyId);
    return this.toPartyResponse(party, members);
  }

  async createParty(userId: string, _dto: CreatePartyDto) {
    const existingParty = await this.partiesRepository.findPartyByUserId(userId);
    if (existingParty) {
      throw new ConflictException('User is already in another active party');
    }

    const maxMembers = this.DEFAULT_MAX_PARTY_MEMBERS;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client: PoolClient = await this.db.getPool().connect();

      try {
        await client.query('BEGIN');

        const party = await this.partiesRepository.insertParty(client, {
          partyId: randomUUID(),
          leaderUserId: userId,
          inviteCode: this.generateInviteCode(),
          maxMembers,
        });

        await this.partiesRepository.insertPartyMember(client, {
          partyMemberId: randomUUID(),
          partyId: party.party_id,
          userId,
        });

        await client.query('COMMIT');

        const snapshot = await this.getPartySnapshot(party.party_id);
        if (!snapshot) {
          throw new NotFoundException('Party not found after creation');
        }

        return {
          message: 'Party created successfully',
          party: snapshot,
        };
      } catch (error: any) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore
        }

        if (error?.code === '23505') {
          const constraint = String(error?.constraint ?? '');

          if (constraint === 'uq_party_members_user') {
            throw new ConflictException('User is already in another active party');
          }

          continue;
        }

        throw error;
      } finally {
        client.release();
      }
    }

    throw new ConflictException('Failed to create party');
  }

  async joinPartyByCode(userId: string, dto: JoinPartyByCodeDto) {
    const existingParty = await this.partiesRepository.findPartyByUserId(userId);
    if (existingParty) {
      throw new ConflictException('User is already in another active party');
    }

    const party = await this.partiesRepository.findPartyByInviteCode(
      dto.inviteCode.trim().toUpperCase(),
    );

    if (!party) {
      throw new NotFoundException('Party not found');
    }

    if (party.party_status !== 'active') {
      throw new ConflictException('Party is not active');
    }

    const memberCount = await this.partiesRepository.getPartyMemberCount(party.party_id);
    if (memberCount >= party.max_members) {
      throw new ConflictException('Party is full');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.partiesRepository.insertPartyMember(client, {
        partyMemberId: randomUUID(),
        partyId: party.party_id,
        userId,
      });

      await client.query('COMMIT');

      const snapshot = await this.getPartySnapshot(party.party_id);
      if (!snapshot) {
        throw new NotFoundException('Party not found after join');
      }

      return {
        message: 'Joined party successfully',
        party: snapshot,
      };
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }

      if (error?.code === '23505') {
        const constraint = String(error?.constraint ?? '');

        if (constraint === 'uq_party_members_user') {
          throw new ConflictException('User is already in another active party');
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentParty(userId: string) {
    const party = await this.partiesRepository.findPartyByUserId(userId);

    if (!party) {
      return {
        party: null,
      };
    }

    const members = await this.partiesRepository.getPartyMembers(party.party_id);

    return {
      party: this.toPartyResponse(party, members),
    };
  }

  async leaveParty(userId: string) {
    const party = await this.partiesRepository.findPartyByUserId(userId);

    if (!party) {
      throw new NotFoundException('Party not found');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.partiesRepository.deletePartyMember(client, party.party_id, userId);

      const remainingCount = await this.partiesRepository.getPartyMemberCount(party.party_id);

      if (remainingCount <= 0) {
        await this.partiesRepository.deleteParty(client, party.party_id);
        await client.query('COMMIT');

        return {
          message: 'Left party successfully. Party was deleted because it became empty.',
          partyDeleted: true,
          partyId: party.party_id,
        };
      }

      if (party.leader_user_id === userId) {
        const nextLeader = await this.partiesRepository.findNextLeaderCandidate(
          party.party_id,
        );

        if (!nextLeader) {
          await this.partiesRepository.deleteParty(client, party.party_id);
          await client.query('COMMIT');

          return {
            message: 'Left party successfully. Party was deleted because it became empty.',
            partyDeleted: true,
            partyId: party.party_id,
          };
        }

        await this.partiesRepository.updatePartyLeader(
          client,
          party.party_id,
          nextLeader.user_id,
        );
      }

      await client.query('COMMIT');

      const snapshot = await this.getPartySnapshot(party.party_id);
      if (!snapshot) {
        return {
          message: 'Left party successfully',
          partyDeleted: true,
          partyId: party.party_id,
        };
      }

      return {
        message: 'Left party successfully',
        partyDeleted: false,
        party: snapshot,
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

  async kickMember(actorUserId: string, dto: KickPartyMemberDto) {
    if (actorUserId === dto.targetUserId) {
      throw new ConflictException('Use leave party instead of kicking yourself');
    }

    const party = await this.partiesRepository.findPartyByUserId(actorUserId);
    if (!party) {
      throw new NotFoundException('Party not found');
    }

    if (party.leader_user_id !== actorUserId) {
      throw new ForbiddenException('Only the party leader can kick members');
    }

    const targetMember = await this.partiesRepository.findPartyMemberByUserId(
      party.party_id,
      dto.targetUserId,
    );

    if (!targetMember) {
      throw new NotFoundException('Target user is not in this party');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.partiesRepository.deletePartyMember(
        client,
        party.party_id,
        dto.targetUserId,
      );

      await client.query('COMMIT');

      const snapshot = await this.getPartySnapshot(party.party_id);
      if (!snapshot) {
        throw new NotFoundException('Party not found after kick');
      }

      return {
        message: 'Member kicked successfully',
        party: snapshot,
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

  async disbandParty(actorUserId: string) {
    const party = await this.partiesRepository.findPartyByUserId(actorUserId);
    if (!party) {
      throw new NotFoundException('Party not found');
    }

    if (party.leader_user_id !== actorUserId) {
      throw new ForbiddenException('Only the party leader can disband the party');
    }

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.partiesRepository.deletePartyMembersByPartyId(client, party.party_id);
      await this.partiesRepository.deleteParty(client, party.party_id);

      await client.query('COMMIT');

      return {
        message: 'Party disbanded successfully',
        partyDeleted: true,
        partyId: party.party_id,
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
}