import { Module } from '@nestjs/common';
import { PasswordService } from '../common/security/password.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, PasswordService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
