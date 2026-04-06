import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DSQL_POOL } from '../database/dsql.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { AppUser } from './models/user.model';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DSQL_POOL) private readonly db: Pool) {}

  async create(dto: CreateUserDto): Promise<AppUser> {
    const result = await this.db.query<AppUser>(
      `
      INSERT INTO app_users (
        username,
        email,
        password_hash,
        display_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      `,
      [
        dto.username,
        dto.email,
        dto.passwordHash,
        dto.displayName,
        dto.status ?? 'active',
      ],
    );

    return result.rows[0];
  }

  async findAll(): Promise<AppUser[]> {
    const result = await this.db.query<AppUser>(
      `
      SELECT
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      FROM app_users
      ORDER BY created_at DESC
      `,
    );

    return result.rows;
  }

  async findById(userId: string): Promise<AppUser | null> {
    const result = await this.db.query<AppUser>(
      `
      SELECT
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      FROM app_users
      WHERE user_id = $1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<AppUser | null> {
    const result = await this.db.query<AppUser>(
      `
      SELECT
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      FROM app_users
      WHERE email = $1
      `,
      [email],
    );

    return result.rows[0] ?? null;
  }

  async updateStatus(
    userId: string,
    status: 'active' | 'banned' | 'deleted',
  ): Promise<AppUser | null> {
    const result = await this.db.query<AppUser>(
      `
      UPDATE app_users
      SET
        status = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      `,
      [userId, status],
    );

    return result.rows[0] ?? null;
  }
}
