import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuroraDsqlModule } from './database/aurora-dsql.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuroraDsqlModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
