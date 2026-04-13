import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  login!: string; // username or email

  @Transform(({ value }) => String(value))
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
