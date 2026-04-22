import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesRepository } from './matches.repository';
import { MatchesService } from './matches.service';
import { GameEngineRegistry } from './engines/game-engine.registry';
import { XoGameEngine } from './engines/xo.game-engine';
import { ParticipationModule } from '../participation/participation.module';
@Module({
  imports: [ParticipationModule],
  controllers: [MatchesController],
  providers: [
    MatchesRepository,
    MatchesService,
    GameEngineRegistry,
    XoGameEngine,
  ],
  exports: [MatchesService, GameEngineRegistry],
})
export class MatchesModule {}
