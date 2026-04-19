import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer as WebSocketServerDecorator,
  WsException,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IncomingMessage } from 'http';
import WebSocket, { WebSocketServer as WsWebSocketServer } from 'ws';
import { URL } from 'url';
import { ChatService } from '../chat/chat.service';
import { SendChatMessageDto } from '../chat/dto/send-chat-message.dto';
import { RoomEventsService } from '../rooms/room-events.service';
import { RoomsService } from '../rooms/rooms.service';

type JwtUserPayload = {
  sub: string;
  username: string;
  email: string;
  displayName: string;
  iat?: number;
  exp?: number;
};

interface AuthenticatedSocket extends WebSocket {
  user?: JwtUserPayload;
  isAlive?: boolean;
  subscriptions?: Set<string>;
}

@WebSocketGateway({
  path: '/ws',
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly listenerCleanupFns: Array<() => void> = [];

  private readonly channelMembers = new Map<string, Set<AuthenticatedSocket>>();

  @WebSocketServerDecorator()
  server!: WsWebSocketServer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly roomsService: RoomsService,
    private readonly roomEventsService: RoomEventsService,
  ) {}

  onModuleInit() {
    this.listenerCleanupFns.push(
      this.roomEventsService.onRoomSnapshot(({ room }) => {
        this.broadcastToChannel(this.buildRoomChannel(room.roomId), 'room_snapshot', {
          room,
        });
      }),
    );

    this.listenerCleanupFns.push(
      this.roomEventsService.onRoomClosed(({ roomId }) => {
        this.broadcastToChannel(this.buildRoomChannel(roomId), 'room_closed', {
          roomId,
        });
      }),
    );

    this.listenerCleanupFns.push(
      this.roomEventsService.onRoomMemberJoined(({ roomId, userId }) => {
        this.broadcastToChannel(
          this.buildRoomChannel(roomId),
          'room_member_joined',
          { roomId, userId },
        );
      }),
    );

    this.listenerCleanupFns.push(
      this.roomEventsService.onRoomMemberLeft(({ roomId, userId }) => {
        this.broadcastToChannel(
          this.buildRoomChannel(roomId),
          'room_member_left',
          { roomId, userId },
        );
      }),
    );

    this.listenerCleanupFns.push(
      this.roomEventsService.onRoomMemberKicked(
        ({ roomId, targetUserId, byUserId }) => {
          this.broadcastToChannel(
            this.buildRoomChannel(roomId),
            'room_member_kicked',
            { roomId, targetUserId, byUserId },
          );
        },
      ),
    );
  }

  afterInit(server: WsWebSocketServer) {
    server.on('connection', (socket: WebSocket) => {
      const client = socket as AuthenticatedSocket;

      client.isAlive = true;
      client.subscriptions = new Set();

      client.on('pong', () => {
        client.isAlive = true;
      });
    });

    this.heartbeatTimer = setInterval(() => {
      server.clients.forEach((socket) => {
        const client = socket as AuthenticatedSocket;

        if (client.isAlive === false) {
          client.terminate();
          return;
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30000);
  }

  handleConnection(client: AuthenticatedSocket, request: IncomingMessage) {
    try {
      const jwtSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
      if (!jwtSecret) {
        client.close(1011, 'Server auth config missing');
        return;
      }

      const requestUrl = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? 'localhost'}`,
      );

      const token = requestUrl.searchParams.get('token');
      if (!token) {
        client.close(1008, 'Missing token');
        return;
      }

      const payload = this.jwtService.verify<JwtUserPayload>(token, {
        secret: jwtSecret,
      });

      client.user = payload;
      client.subscriptions = new Set();

      client.send(
        JSON.stringify({
          event: 'connected',
          data: {
            userId: payload.sub,
            username: payload.username,
            displayName: payload.displayName,
          },
        }),
      );

      this.logger.log(`WS connected: ${payload.username}`);
    } catch {
      client.close(1008, 'Unauthorized');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.removeClientFromAllChannels(client);
    const username = client.user?.username ?? 'unknown';
    this.logger.log(`WS disconnected: ${username}`);
  }

  private buildRoomChannel(roomId: string) {
    return `room:${roomId}`;
  }

  private buildMatchChannel(matchId: string) {
    return `match:${matchId}`;
  }

  private addClientToChannel(client: AuthenticatedSocket, channel: string) {
    let members = this.channelMembers.get(channel);

    if (!members) {
      members = new Set<AuthenticatedSocket>();
      this.channelMembers.set(channel, members);
    }

    members.add(client);
    client.subscriptions ??= new Set<string>();
    client.subscriptions.add(channel);
  }

  private removeClientFromAllChannels(client: AuthenticatedSocket) {
    if (!client.subscriptions) return;

    for (const channel of client.subscriptions) {
      const members = this.channelMembers.get(channel);
      if (!members) continue;

      members.delete(client);

      if (members.size === 0) {
        this.channelMembers.delete(channel);
      }
    }

    client.subscriptions.clear();
  }

  private broadcastToChannel(channel: string, event: string, data: unknown) {
    const members = this.channelMembers.get(channel);
    if (!members) return;

    const payload = JSON.stringify({ event, data });

    for (const client of members) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  @SubscribeMessage('room_subscribe')
  async handleRoomSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId?: string },
  ) {
    const userId = client.user?.sub;
    if (!userId) {
      throw new WsException('Unauthorized');
    }

    if (!data.roomId) {
      throw new WsException('roomId is required');
    }

    const result = await this.roomsService.getRoom(data.roomId, userId);

    const channel = this.buildRoomChannel(data.roomId);
    this.addClientToChannel(client, channel);

    return {
      event: 'room_snapshot',
      data: result,
    };
  }

  @SubscribeMessage('room_unsubscribe')
  handleRoomUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId?: string },
  ) {
    if (!data.roomId) {
      throw new WsException('roomId is required');
    }

    const channel = this.buildRoomChannel(data.roomId);
    const members = this.channelMembers.get(channel);

    members?.delete(client);
    client.subscriptions?.delete(channel);

    if (members && members.size === 0) {
      this.channelMembers.delete(channel);
    }

    return {
      event: 'room_unsubscribed',
      data: { roomId: data.roomId },
    };
  }

  @SubscribeMessage('chat_subscribe')
  async handleChatSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId?: string; matchId?: string },
  ) {
    const userId = client.user?.sub;
    if (!userId) {
      throw new WsException('Unauthorized');
    }

    await this.chatService.getRecentMessages({
      roomId: data.roomId,
      matchId: data.matchId,
      userId,
    });

    if (data.roomId) {
      const channel = this.buildRoomChannel(data.roomId);
      this.addClientToChannel(client, channel);

      const history = await this.chatService.getRecentMessages({
        roomId: data.roomId,
        userId,
      });

      return {
        event: 'chat_history',
        data: {
          roomId: data.roomId,
          messages: history,
        },
      };
    }

    if (data.matchId) {
      const channel = this.buildMatchChannel(data.matchId);
      this.addClientToChannel(client, channel);

      const history = await this.chatService.getRecentMessages({
        matchId: data.matchId,
        userId,
      });

      return {
        event: 'chat_history',
        data: {
          matchId: data.matchId,
          messages: history,
        },
      };
    }

    throw new WsException('roomId or matchId is required');
  }

  @SubscribeMessage('chat_unsubscribe')
  handleChatUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId?: string; matchId?: string },
  ) {
    const channel = data.roomId
      ? this.buildRoomChannel(data.roomId)
      : data.matchId
        ? this.buildMatchChannel(data.matchId)
        : null;

    if (!channel) {
      throw new WsException('roomId or matchId is required');
    }

    const members = this.channelMembers.get(channel);
    members?.delete(client);
    client.subscriptions?.delete(channel);

    if (members && members.size === 0) {
      this.channelMembers.delete(channel);
    }

    return {
      event: 'chat_unsubscribed',
      data,
    };
  }

  @SubscribeMessage('chat_send')
  async handleChatSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendChatMessageDto,
  ) {
    const userId = client.user?.sub;
    if (!userId) {
      throw new WsException('Unauthorized');
    }

    try {
      const saved = await this.chatService.sendMessage(userId, data);

      const channel = saved.roomId
        ? this.buildRoomChannel(saved.roomId)
        : this.buildMatchChannel(saved.matchId!);

      this.broadcastToChannel(channel, 'chat_message', saved);

      return {
        event: 'chat_sent',
        data: {
          messageId: saved.messageId,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send message';
      throw new WsException(message);
    }
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const cleanup of this.listenerCleanupFns) {
      cleanup();
    }
  }
}
