import { Module } from '@nestjs/common';
import { MatchesModule } from '../matches/matches.module';
import { PartiesModule } from '../parties/parties.module';
import { ParticipationModule } from '../participation/participation.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingEventsService } from './matchmaking-events.service';
import { MatchmakingRepository } from './matchmaking.repository';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingTimeoutService } from './matchmaking-timeout.service';

@Module({
  imports: [PartiesModule, ParticipationModule, MatchesModule],
  controllers: [MatchmakingController],
  providers: [
    MatchmakingRepository,
    MatchmakingService,
    MatchmakingTimeoutService,
    MatchmakingEventsService,
  ],
  exports: [MatchmakingService, MatchmakingEventsService],
})
export class MatchmakingModule {}