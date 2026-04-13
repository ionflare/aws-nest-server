import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuroraDsqlService } from '../database/aurora-dsql.service';

export type AppUserRow = QueryResultRow & {
  user_id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: string;
};

export type PublicUserRow = QueryResultRow & {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  status: string;
};

export type SessionRow = QueryResultRow & {
  session_id: string;
  user_id: string;
  expires_at: string;
};

export type CreateSessionParams = {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
};

type Queryable = Pick<PoolClient, 'query'>;

@Injectable()
export class AuthRepository {
  constructor(private readonly db: AuroraDsqlService) {}

  async findUserByLogin(login: string): Promise<AppUserRow | null> {
    const result = await this.db.query<AppUserRow>(
      `
      SELECT
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status
      FROM boardgame_prod.app_users
      WHERE lower(username) = lower($1)
         OR lower(email) = lower($1)
      LIMIT 1
      `,
      [login],
    );

    return result.rows[0] ?? null;
  }

  async findUserById(userId: string): Promise<AppUserRow | null> {
    const result = await this.db.query<AppUserRow>(
      `
      SELECT
        user_id,
        username,
        email,
        password_hash,
        display_name,
        status
      FROM boardgame_prod.app_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async findPublicUserById(userId: string): Promise<PublicUserRow | null> {
    const result = await this.db.query<PublicUserRow>(
      `
      SELECT
        user_id,
        username,
        email,
        display_name,
        status
      FROM boardgame_prod.app_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  async createSession(
    executor: Queryable,
    params: CreateSessionParams,
  ): Promise<void> {
    await executor.query(
      `
      INSERT INTO boardgame_prod.auth_sessions (
        session_id,
        user_id,
        refresh_token_hash,
        ip_text,
        user_agent,
        expires_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `,
      [
        params.sessionId,
        params.userId,
        params.refreshTokenHash,
        params.ip ?? null,
        params.userAgent ?? null,
        params.expiresAt,
      ],
    );
  }

  async findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionRow | null> {
    const result = await this.db.query<SessionRow>(
      `
      SELECT
        session_id,
        user_id,
        expires_at
      FROM boardgame_prod.auth_sessions
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
      `,
      [refreshTokenHash],
    );

    return result.rows[0] ?? null;
  }

  async revokeSessionById(
    executor: Queryable,
    sessionId: string,
  ): Promise<void> {
    await executor.query(
      `
      UPDATE boardgame_prod.auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
      `,
      [sessionId],
    );
  }

  async revokeSessionByRefreshTokenHash(refreshTokenHash: string): Promise<void> {
    await this.db.query(
      `
      UPDATE boardgame_prod.auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL
      `,
      [refreshTokenHash],
    );
  }
}
