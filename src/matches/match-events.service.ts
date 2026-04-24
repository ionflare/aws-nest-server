import { Injectable } from '@nestjs/common';

type Listener<T> = (payload: T) => void;

@Injectable()
export class MatchEventsService {
  private readonly matchStateUpdatedListeners = new Set<
    Listener<{ matchId: string }>
  >();

  onMatchStateUpdated(listener: Listener<{ matchId: string }>) {
    this.matchStateUpdatedListeners.add(listener);
    return () => this.matchStateUpdatedListeners.delete(listener);
  }

  emitMatchStateUpdated(matchId: string) {
    for (const listener of this.matchStateUpdatedListeners) {
      listener({ matchId });
    }
  }
}