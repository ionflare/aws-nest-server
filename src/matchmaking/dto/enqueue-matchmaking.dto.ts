import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class EnqueueMatchmakingDto {
  @IsUUID()
  gameTypeId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  teamSize!: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(60)
  acceptTimeoutSec?: number;
}