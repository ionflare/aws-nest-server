import { IsInt, Max, Min, IsOptional } from 'class-validator';

export class CreatePartyDto {
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(5)
  maxMembers?: number;
}