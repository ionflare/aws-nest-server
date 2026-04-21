import { Injectable } from '@nestjs/common';
import { GameEngine } from './game-engine.interface';
import { XoGameEngine } from './xo.game-engine';

@Injectable()
export class GameEngineRegistry {
  private readonly engines = new Map<string, GameEngine>();

  constructor(
    private readonly xoGameEngine: XoGameEngine,
  ) {
    this.engines.set(this.xoGameEngine.gameCode, this.xoGameEngine);
  }

  get(gameCode: string): GameEngine {
    const engine = this.engines.get(gameCode);

    if (!engine) {
      throw new Error(`No game engine registered for gameCode=${gameCode}`);
    }

    return engine;
  }
}
