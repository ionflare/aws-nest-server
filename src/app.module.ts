import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuroraDsqlModule } from './database/aurora-dsql.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoomsModule } from './rooms/rooms.module';
import { MatchesModule } from './matches/matches.module';
import { ParticipationModule } from './participation/participation.module';
import { PartiesModule } from './parties/parties.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RatingsModule } from './ratings/ratings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuroraDsqlModule,
    UsersModule,
    AuthModule,
    RealtimeModule,
    RoomsModule,
    MatchesModule,
    ParticipationModule,
    PartiesModule,
    MatchmakingModule,
    RatingsModule,
  ],
})
export class AppModule {}