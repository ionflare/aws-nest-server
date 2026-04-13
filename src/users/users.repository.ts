import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export type CreatedUserRow = {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
};

export type CreateUserParams = {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
};

@Injectable()
export class UsersRepository {
  async createUser(
    client: PoolClient,
    params: CreateUserParams,
  ): Promise<CreatedUserRow> {
    const result = await client.query<CreatedUserRow>(
      `
      INSERT INTO boardgame_prod.app_users (
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING
        user_id,
        username,
        email,
        display_name,
        status,
        created_at
      `,
      [
        params.userId,
        params.username,
        params.email,
        params.passwordHash,
        params.displayName,
      ],
    );

    return result.rows[0];
  }
}
