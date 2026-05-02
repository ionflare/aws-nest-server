import { IsUUID } from 'class-validator';

export class RejectProposedMatchDto {
  @IsUUID()
  proposedMatchId!: string;
}