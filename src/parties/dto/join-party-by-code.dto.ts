import { IsString, Length } from 'class-validator';

export class JoinPartyByCodeDto {
  @IsString()
  @Length(4, 12)
  inviteCode!: string;
}