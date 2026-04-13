import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username must contain only lowercase letters, numbers, and underscores',
  })
  username!: string;

  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;
}
