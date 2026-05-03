import { Injectable } from '@nestjs/common';

type Listener<T> = (payload: T) => void;

@Injectable()
export class MatchmakingEventsService {
  private readonly proposedMatchFoundListeners = new Set<
    Listener<{ userIds: string[]; proposedMatchId: string }>
  >();

  private readonly proposedMatchFailedListeners = new Set<
    Listener<{ userIds: string[]; proposedMatchId: string }>
  >();

  private readonly matchConfirmedListeners = new Set<
    Listener<{ userIds: string[]; proposedMatchId: string; matchId: string }>
  >();

  onProposedMatchFound(
    listener: Listener<{ userIds: string[]; proposedMatchId: string }>,
  ) {
    this.proposedMatchFoundListeners.add(listener);
    return () => this.proposedMatchFoundListeners.delete(listener);
  }

  onProposedMatchFailed(
    listener: Listener<{ userIds: string[]; proposedMatchId: string }>,
  ) {
    this.proposedMatchFailedListeners.add(listener);
    return () => this.proposedMatchFailedListeners.delete(listener);
  }

  onMatchConfirmed(
    listener: Listener<{
      userIds: string[];
      proposedMatchId: string;
      matchId: string;
    }>,
  ) {
    this.matchConfirmedListeners.add(listener);
    return () => this.matchConfirmedListeners.delete(listener);
  }

  emitProposedMatchFound(userIds: string[], proposedMatchId: string) {
    for (const listener of this.proposedMatchFoundListeners) {
      listener({ userIds, proposedMatchId });
    }
  }

  emitProposedMatchFailed(userIds: string[], proposedMatchId: string) {
    for (const listener of this.proposedMatchFailedListeners) {
      listener({ userIds, proposedMatchId });
    }
  }

  emitMatchConfirmed(
    userIds: string[],
    proposedMatchId: string,
    matchId: string,
  ) {
    for (const listener of this.matchConfirmedListeners) {
      listener({ userIds, proposedMatchId, matchId });
    }
  }
}