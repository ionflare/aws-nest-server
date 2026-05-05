import { Module } from '@nestjs/common';
import { ParticipationModule } from '../participation/participation.module';
import { RatingsModule } from '../ratings/ratings.module';
import { MatchEventsService } from './match-events.service';
import { MatchTimeoutService } from './match-timeout.service';
import { MatchesController } from './matches.controller';
import { MatchesRepository } from './matches.repository';
import { MatchesService } from './matches.service';
import { Dummy2v2GameEngine } from './engines/dummy2v2.game-engine';
import { GameEngineRegistry } from './engines/game-engine.registry';
import { XoGameEngine } from './engines/xo.game-engine';

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
    Dummy2v2GameEngine,
  ],
  exports: [MatchesService, GameEngineRegistry, MatchEventsService],
})
export class MatchesModule {}