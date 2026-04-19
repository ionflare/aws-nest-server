import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SendChatMessageDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  @IsString()
  @Length(1, 1000)
  messageText!: string;
}
