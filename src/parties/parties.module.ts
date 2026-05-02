import { Module } from '@nestjs/common';
import { PartiesController } from './parties.controller';
import { PartiesRepository } from './parties.repository';
import { PartiesService } from './parties.service';

@Module({
  controllers: [PartiesController],
  providers: [PartiesRepository, PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}