import { ConflictException, Injectable } from '@nestjs/common';
import {
  ApplyMoveResult,
  CreateInitialStateResult,
  GameEngine,
  GamePlayer,
} from './game-engine.interface';

export type XoSymbol = 'X' | 'O';

export type XoState = {
  board: Array<XoSymbol | null>;
  symbols: Array<{
    userId: string;
    seatNo: number;
    symbol: XoSymbol;
  }>;
  nextUserId: string | null;
  winnerUserId: string | null;
  winnerSymbol: XoSymbol | null;
  isDraw: boolean;
  status: 'active' | 'finished';
  winningLine: number[] | null;
};

export type XoMove = {
  cellIndex: number;
};

@Injectable()
export class XoGameEngine implements GameEngine<XoState, XoMove> {
  readonly gameCode = 'xo';

  createInitialState(players: GamePlayer[]): CreateInitialStateResult<XoState> {
    if (players.length !== 2) {
      throw new ConflictException('Tic Tac Toe requires exactly 2 players');
    }

    const sorted = [...players].sort((a, b) => a.seatNo - b.seatNo);

    const initialState: XoState = {
      board: [null, null, null, null, null, null, null, null, null],
      symbols: [
        {
          userId: sorted[0].userId,
          seatNo: sorted[0].seatNo,
          symbol: 'X',
        },
        {
          userId: sorted[1].userId,
          seatNo: sorted[1].seatNo,
          symbol: 'O',
        },
      ],
      nextUserId: sorted[0].userId,
      winnerUserId: null,
      winnerSymbol: null,
      isDraw: false,
      status: 'active',
      winningLine: null,
    };

    return {
      initialState,
      startingPlayerUserId: sorted[0].userId,
    };
  }

  validateMove(params: {
    state: XoState;
    userId: string;
    move: XoMove;
    players: GamePlayer[];
    currentPlayerUserId: string | null;
  }): void {
    const { state, userId, move, currentPlayerUserId } = params;

    if (state.status !== 'active') {
      throw new ConflictException('Match is already finished');
    }

    if (currentPlayerUserId !== userId) {
      throw new ConflictException('It is not your turn');
    }

    if (!Number.isInteger(move?.cellIndex) || move.cellIndex < 0 || move.cellIndex > 8) {
      throw new ConflictException('Invalid cell index');
    }

    if (state.board[move.cellIndex] !== null) {
      throw new ConflictException('Cell is already occupied');
    }
  }

  applyMove(params: {
    state: XoState;
    userId: string;
    move: XoMove;
    players: GamePlayer[];
    currentPlayerUserId: string | null;
  }): ApplyMoveResult<XoState> {
    const { state, userId, move } = params;

    this.validateMove(params);

    const symbol = this.getUserSymbol(state, userId);

    const nextBoard = [...state.board];
    nextBoard[move.cellIndex] = symbol;

    const winningLine = this.findWinningLine(nextBoard);
    const isDraw = !winningLine && nextBoard.every((cell) => cell !== null);
    const finished = Boolean(winningLine) || isDraw;

    const nextPlayerUserId = finished ? null : this.getOtherUserId(state, userId);

    const nextState: XoState = {
      board: nextBoard,
      symbols: state.symbols,
      nextUserId: nextPlayerUserId,
      winnerUserId: winningLine ? userId : null,
      winnerSymbol: winningLine ? symbol : null,
      isDraw,
      status: finished ? 'finished' : 'active',
      winningLine,
    };

    return {
      nextState,
      nextPlayerUserId,
      finished,
      winnerUserId: winningLine ? userId : null,
      moveType: 'place_mark',
      movePayload: {
        cellIndex: move.cellIndex,
        symbol,
      },
    };
  }

  private getUserSymbol(state: XoState, userId: string): XoSymbol {
    const symbol = state.symbols.find((item) => item.userId === userId)?.symbol;

    if (!symbol) {
      throw new ConflictException('User symbol not found');
    }

    return symbol;
  }

  private getOtherUserId(state: XoState, userId: string): string | null {
    return state.symbols.find((item) => item.userId !== userId)?.userId ?? null;
  }

  private findWinningLine(board: Array<XoSymbol | null>): number[] | null {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }

    return null;
  }
}
