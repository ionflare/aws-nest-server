import { Injectable } from '@nestjs/common';
import { GameEngine } from './game-engine.interface';
import { Dummy2v2GameEngine } from './dummy2v2.game-engine';
import { XoGameEngine } from './xo.game-engine';

@Injectable()
export class GameEngineRegistry {
  private readonly engines = new Map<string, GameEngine>();

  constructor(
    private readonly xoGameEngine: XoGameEngine,
    private readonly dummy2v2GameEngine: Dummy2v2GameEngine,
  ) {
    this.engines.set(this.xoGameEngine.gameCode, this.xoGameEngine);
    this.engines.set(this.dummy2v2GameEngine.gameCode, this.dummy2v2GameEngine);
  }

  get(gameCode: string): GameEngine {
    const engine = this.engines.get(gameCode);

    if (!engine) {
      throw new Error(`No game engine registered for gameCode=${gameCode}`);
    }

    return engine;
  }
}