import { Injectable } from '@nestjs/common';

export type RoomMemberView = {
  roomPlayerId: string;
  roomId: string;
  userId: string;
  username: string;
  displayName: string;
  seatNo: number | null;
  isReady: boolean;
  isHost: boolean;
  joinedAt: string;
};

export type RoomSnapshotView = {
  roomId: string;
  roomCode: string;
  gameTypeId: string;
  roomName: string;
  hostUserId: string;
  isPrivate: boolean;
  maxPlayers: number;
  roomStatus: string;
  settingsText: string | null;
  createdAt: string;
  updatedAt: string;
  members: RoomMemberView[];
};

type Listener<T> = (payload: T) => void;

@Injectable()
export class RoomEventsService {
  private readonly roomSnapshotListeners = new Set<
    Listener<{ room: RoomSnapshotView }>
  >();

  private readonly roomClosedListeners = new Set<
    Listener<{ roomId: string }>
  >();

  private readonly roomMemberJoinedListeners = new Set<
    Listener<{ roomId: string; userId: string }>
  >();

  private readonly roomMemberLeftListeners = new Set<
    Listener<{ roomId: string; userId: string }>
  >();

  private readonly roomMemberKickedListeners = new Set<
    Listener<{ roomId: string; targetUserId: string; byUserId: string }>
  >();

  private readonly roomStartedListeners = new Set<
    Listener<{ roomId: string; matchId: string }>
  >();

  onRoomSnapshot(listener: Listener<{ room: RoomSnapshotView }>) {
    this.roomSnapshotListeners.add(listener);
    return () => this.roomSnapshotListeners.delete(listener);
  }

  onRoomClosed(listener: Listener<{ roomId: string }>) {
    this.roomClosedListeners.add(listener);
    return () => this.roomClosedListeners.delete(listener);
  }

  onRoomMemberJoined(listener: Listener<{ roomId: string; userId: string }>) {
    this.roomMemberJoinedListeners.add(listener);
    return () => this.roomMemberJoinedListeners.delete(listener);
  }

  onRoomMemberLeft(listener: Listener<{ roomId: string; userId: string }>) {
    this.roomMemberLeftListeners.add(listener);
    return () => this.roomMemberLeftListeners.delete(listener);
  }

  onRoomMemberKicked(
    listener: Listener<{ roomId: string; targetUserId: string; byUserId: string }>,
  ) {
    this.roomMemberKickedListeners.add(listener);
    return () => this.roomMemberKickedListeners.delete(listener);
  }

  onRoomStarted(listener: Listener<{ roomId: string; matchId: string }>) {
    this.roomStartedListeners.add(listener);
    return () => this.roomStartedListeners.delete(listener);
  }

  emitRoomSnapshot(room: RoomSnapshotView) {
    for (const listener of this.roomSnapshotListeners) {
      listener({ room });
    }
  }

  emitRoomClosed(roomId: string) {
    for (const listener of this.roomClosedListeners) {
      listener({ roomId });
    }
  }

  emitRoomMemberJoined(roomId: string, userId: string) {
    for (const listener of this.roomMemberJoinedListeners) {
      listener({ roomId, userId });
    }
  }

  emitRoomMemberLeft(roomId: string, userId: string) {
    for (const listener of this.roomMemberLeftListeners) {
      listener({ roomId, userId });
    }
  }

  emitRoomMemberKicked(roomId: string, targetUserId: string, byUserId: string) {
    for (const listener of this.roomMemberKickedListeners) {
      listener({ roomId, targetUserId, byUserId });
    }
  }

  emitRoomStarted(roomId: string, matchId: string) {
    for (const listener of this.roomStartedListeners) {
      listener({ roomId, matchId });
    }
  }
}
