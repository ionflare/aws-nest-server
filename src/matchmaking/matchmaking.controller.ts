import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AcceptProposedMatchDto } from './dto/accept-proposed-match.dto';
import { EnqueueMatchmakingDto } from './dto/enqueue-matchmaking.dto';
import { RejectProposedMatchDto } from './dto/reject-proposed-match.dto';
import { MatchmakingService } from './matchmaking.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @Post('queue')
  async enqueue(
    @Body() dto: EnqueueMatchmakingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matchmakingService.enqueue(req.user.sub, dto);
  }

  @Post('cancel')
  async cancelQueue(@Req() req: AuthenticatedRequest) {
    return this.matchmakingService.cancelQueue(req.user.sub);
  }

  @Get('current')
  async getCurrent(@Req() req: AuthenticatedRequest) {
    return this.matchmakingService.getCurrent(req.user.sub);
  }

  @Post('accept')
  async accept(
    @Body() dto: AcceptProposedMatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matchmakingService.acceptProposedMatch(req.user.sub, dto);
  }

  @Post('reject')
  async reject(
    @Body() dto: RejectProposedMatchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matchmakingService.rejectProposedMatch(req.user.sub, dto);
  }
}