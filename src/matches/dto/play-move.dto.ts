import { IsObject, IsUUID } from 'class-validator';

export class PlayMoveDto {
  @IsUUID()
  matchId!: string;

  @IsObject()
  move!: Record<string, unknown>;
}
