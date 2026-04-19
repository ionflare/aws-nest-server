import { Module } from '@nestjs/common';
import { PasswordService } from '../common/security/password.service';
import { RoomsController } from './rooms.controller';
import { RoomEventsService } from './room-events.service';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [
    RoomsService,
    RoomsRepository,
    RoomEventsService,
    PasswordService,
  ],
  exports: [RoomsService, RoomEventsService],
})
export class RoomsModule {}
