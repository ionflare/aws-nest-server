import { Module } from '@nestjs/common';
import { ParticipationController } from './participation.controller';
import { ParticipationRepository } from './participation.repository';
import { ParticipationService } from './participation.service';

@Module({
  controllers: [ParticipationController],
  providers: [ParticipationRepository, ParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}