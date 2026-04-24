import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MatchesService } from './matches.service';

@Injectable()
export class MatchTimeoutService {
  private readonly logger = new Logger(MatchTimeoutService.name);

  constructor(private readonly matchesService: MatchesService) {}

  @Interval(1000)
  async handleExpiredTurns() {
    try {
      await this.matchesService.resolveExpiredMatches(20);
    } catch (error) {
      this.logger.error('Failed to resolve expired turns', error as Error);
    }
  }
}