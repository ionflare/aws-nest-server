import { IsUUID } from 'class-validator';

export class KickRoomUserDto {
  @IsUUID()
  targetUserId!: string;
}
