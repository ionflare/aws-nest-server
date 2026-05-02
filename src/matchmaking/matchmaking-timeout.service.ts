import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MatchmakingService } from './matchmaking.service';

@Injectable()
export class MatchmakingTimeoutService {
  private readonly logger = new Logger(MatchmakingTimeoutService.name);

  constructor(private readonly matchmakingService: MatchmakingService) {}

  @Interval(1000)
  async handleExpiredProposals() {
    try {
      await this.matchmakingService.resolveExpiredProposedMatches(20);
    } catch (error) {
      this.logger.error(
        'Failed to resolve expired proposed matches',
        error as Error,
      );
    }
  }
}