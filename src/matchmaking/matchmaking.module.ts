import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { ParticipationModule } from '../participation/participation.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingRepository } from './matchmaking.repository';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingTimeoutService } from './matchmaking-timeout.service';

@Module({
  imports: [PartiesModule, ParticipationModule],
  controllers: [MatchmakingController],
  providers: [
    MatchmakingRepository,
    MatchmakingService,
    MatchmakingTimeoutService,
  ],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}