import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class JoinRoomDto {
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsString()
  @Length(4, 20)
  roomCode!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value).trim(),
  )
  @IsString()
  @Length(1, 100)
  roomPassword?: string;
}
