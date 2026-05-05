import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RatingsService } from './ratings.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get('my')
  async getMyRatings(@Req() req: AuthenticatedRequest) {
    return this.ratingsService.getMyRatings(req.user.sub);
  }
}