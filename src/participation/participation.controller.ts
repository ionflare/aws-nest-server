import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParticipationService } from './participation.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('session')
export class ParticipationController {
  constructor(
    private readonly participationService: ParticipationService,
  ) {}

  @Get('resume')
  async getResumeContext(@Req() req: AuthenticatedRequest) {
    return this.participationService.getResumeContext(req.user.sub);
  }
}