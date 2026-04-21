export type GamePlayer = {
  userId: string;
  seatNo: number;
};

export type CreateInitialStateResult<TState = unknown> = {
  initialState: TState;
  startingPlayerUserId: string | null;
};

export type ApplyMoveResult<TState = unknown, TMovePayload = unknown> = {
  nextState: TState;
  nextPlayerUserId: string | null;
  finished: boolean;
  winnerUserId: string | null;
  moveType: string;
  movePayload: TMovePayload;
};

export interface GameEngine<TState = unknown, TMove = unknown> {
  readonly gameCode: string;

  createInitialState(players: GamePlayer[]): CreateInitialStateResult<TState>;

  validateMove(params: {
    state: TState;
    userId: string;
    move: TMove;
    players: GamePlayer[];
    currentPlayerUserId: string | null;
  }): void;

  applyMove(params: {
    state: TState;
    userId: string;
    move: TMove;
    players: GamePlayer[];
    currentPlayerUserId: string | null;
  }): ApplyMoveResult<TState>;
}
