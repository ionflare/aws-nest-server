import { IsUUID } from 'class-validator';

export class KickPartyMemberDto {
  @IsUUID()
  targetUserId!: string;
}