import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { KickRoomUserDto } from './dto/kick-room-user.dto';
import { RoomsService } from './rooms.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('game-types')
  async listGameTypes() {
    return this.roomsService.listGameTypes();
  }

  @Post('create')
  async createRoom(
    @Body() dto: CreateRoomDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roomsService.createRoom(req.user.sub, dto);
  }

  @Post('join')
  async joinRoom(
    @Body() dto: JoinRoomDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roomsService.joinRoom(req.user.sub, dto);
  }

  @Post(':roomId/leave')
  async leaveRoom(
    @Param('roomId') roomId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roomsService.leaveRoom(roomId, req.user.sub);
  }

  @Post(':roomId/kick')
  async kickUser(
    @Param('roomId') roomId: string,
    @Body() dto: KickRoomUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roomsService.kickUser(roomId, req.user.sub, dto);
  }

  @Get(':roomId')
  async getRoom(
    @Param('roomId') roomId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roomsService.getRoom(roomId, req.user.sub);
  }
  
  @Post(':roomId/toggle-ready')
  async toggleReady(
  @Param('roomId') roomId: string,
  @Req() req: AuthenticatedRequest,
  ) {
   return this.roomsService.toggleReady(roomId, req.user.sub);
  }

  @Post(':roomId/start-match')
  async startMatch(
  @Param('roomId') roomId: string,
  @Req() req: AuthenticatedRequest,
  ) {
   return this.roomsService.startMatch(roomId, req.user.sub);
  }
}
