import { Module } from '@nestjs/common';
import { ParticipationModule } from '../participation/participation.module';
import { MatchEventsService } from './match-events.service';
import { MatchTimeoutService } from './match-timeout.service';
import { MatchesController } from './matches.controller';
import { MatchesRepository } from './matches.repository';
import { MatchesService } from './matches.service';
import { GameEngineRegistry } from './engines/game-engine.registry';
import { XoGameEngine } from './engines/xo.game-engine';
import { RatingsModule } from 'src/ratings/ratings.module';

@Module({
  imports: [ParticipationModule, RatingsModule],
  controllers: [MatchesController],
  providers: [
    MatchesRepository,
    MatchesService,
    MatchEventsService,
    MatchTimeoutService,
    GameEngineRegistry,
    XoGameEngine,
  ],
  exports: [MatchesService, GameEngineRegistry, MatchEventsService],
})
export class MatchesModule {}