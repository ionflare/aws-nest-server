import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  gameTypeId!: string;

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @Length(1, 100)
  roomName!: string;

  @IsInt()
  @Min(2)
  @Max(16)
  maxPlayers!: number;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value).trim(),
  )
  @IsString()
  @Length(4, 100)
  roomPassword?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value).trim(),
  )
  @IsString()
  @MaxLength(5000)
  settingsText?: string;
}
