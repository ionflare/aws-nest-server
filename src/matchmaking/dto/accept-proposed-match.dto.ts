import { IsUUID } from 'class-validator';

export class AcceptProposedMatchDto {
  @IsUUID()
  proposedMatchId!: string;
}