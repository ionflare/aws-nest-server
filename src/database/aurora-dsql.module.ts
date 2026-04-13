import { Global, Module } from '@nestjs/common';
import { AuroraDsqlService } from './aurora-dsql.service';

@Global()
@Module({
  providers: [AuroraDsqlService],
  exports: [AuroraDsqlService],
})
export class AuroraDsqlModule {}
