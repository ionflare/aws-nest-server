import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RealtimeGateway } from './realtime.gateway';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [AuthModule, ChatModule, RoomsModule, MatchesModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
