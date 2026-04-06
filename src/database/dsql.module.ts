import { Global, Module } from '@nestjs/common';
import { dsqlProvider } from './dsql.provider';

@Global()
@Module({
  providers: [dsqlProvider],
  exports: [dsqlProvider],
})
export class DsqlModule {}
