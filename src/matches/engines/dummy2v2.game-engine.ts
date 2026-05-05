import { ConflictException, Injectable } from '@nestjs/common';
import {
  ApplyMoveResult,
  CreateInitialStateResult,
  GameEngine,
  GamePlayer,
} from './game-engine.interface';

export type Dummy2v2State = {
  teams: Array<{
    teamNo: 1 | 2;
    playerUserIds: string[];
  }>;
  status: 'active' | 'finished';
  winnerTeamNo: 1 | 2 | null;
  winnerUserId: string | null;
  endedReason?: 'auto_start_team1_win';
};

@Injectable()
export class Dummy2v2GameEngine
  implements GameEngine<Dummy2v2State, Record<string, never>>
{
  readonly gameCode = 'dummy2v2';

  createInitialState(
    players: GamePlayer[],
  ): CreateInitialStateResult<Dummy2v2State> {
    if (players.length !== 4) {
      throw new ConflictException('Dummy 2v2 requires exactly 4 players');
    }

    const sorted = [...players].sort((a, b) => a.seatNo - b.seatNo);

    const team1 = sorted.slice(0, 2);
    const team2 = sorted.slice(2, 4);

    return {
      initialState: {
        teams: [
          {
            teamNo: 1,
            playerUserIds: team1.map((player) => player.userId),
          },
          {
            teamNo: 2,
            playerUserIds: team2.map((player) => player.userId),
          },
        ],
        status: 'active',
        winnerTeamNo: null,
        winnerUserId: null,
      },
      startingPlayerUserId: null,
    };
  }

  resolveOnStart(params: {
    state: Dummy2v2State;
    players: GamePlayer[];
  }): ApplyMoveResult<Dummy2v2State> {
    const team1UserIds = params.state.teams.find((team) => team.teamNo === 1)?.playerUserIds ?? [];
    const winnerUserId = team1UserIds[0] ?? null;

    const nextState: Dummy2v2State = {
      ...params.state,
      status: 'finished',
      winnerTeamNo: 1,
      winnerUserId,
      endedReason: 'auto_start_team1_win',
    };

    return {
      nextState,
      nextPlayerUserId: null,
      finished: true,
      winnerUserId,
      moveType: 'auto_start_team1_win',
      movePayload: {
        winnerTeamNo: 1,
        winnerUserId,
      },
    };
  }

  validateMove(): void {
    throw new ConflictException('Dummy 2v2 has no playable moves');
  }

  applyMove(): ApplyMoveResult<Dummy2v2State> {
    throw new ConflictException('Dummy 2v2 has no playable moves');
  }

  resolveTimeout(): ApplyMoveResult<Dummy2v2State> {
    throw new ConflictException('Dummy 2v2 finishes instantly on start');
  }

  resolveConcede(): ApplyMoveResult<Dummy2v2State> {
    throw new ConflictException('Dummy 2v2 finishes instantly on start');
  }
}