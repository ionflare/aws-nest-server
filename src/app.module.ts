import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuroraDsqlModule } from './database/aurora-dsql.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoomsModule } from './rooms/rooms.module';
import { MatchesModule } from './matches/matches.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuroraDsqlModule,
    UsersModule,
    AuthModule,
    RealtimeModule,
    RoomsModule,
    MatchesModule,
  ],
})
export class AppModule {}
