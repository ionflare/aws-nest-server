import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { PasswordService } from '../common/security/password.service';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly passwordService: PasswordService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async register(dto: RegisterUserDto) {
    const client: PoolClient = await this.db.getPool().connect();

    try {
      const userId = randomUUID();
      const passwordHash = await this.passwordService.hash(dto.password);

      await client.query('BEGIN');

      const user = await this.usersRepository.createUser(client, {
        userId,
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      });

      await client.query('COMMIT');

      return {
        message: 'User registered successfully',
        user,
      };
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }

      if (error?.code === '23505') {
        const constraint = String(error?.constraint ?? '');

        if (constraint.includes('uq_app_users_username')) {
          throw new ConflictException('Username already exists');
        }

        if (constraint.includes('uq_app_users_email')) {
          throw new ConflictException('Email already exists');
        }

        throw new ConflictException('Username or email already exists');
      }

      throw new InternalServerErrorException('Failed to register user');
    } finally {
      client.release();
    }
  }
}
