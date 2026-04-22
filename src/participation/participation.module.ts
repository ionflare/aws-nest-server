import { Module } from '@nestjs/common';
import { ParticipationRepository } from './participation.repository';
import { ParticipationService } from './participation.service';

@Module({
  providers: [ParticipationRepository, ParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}