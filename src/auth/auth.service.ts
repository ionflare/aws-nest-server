import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { PasswordService } from '../common/security/password.service';
import { AuroraDsqlService } from '../database/aurora-dsql.service';
import { AuthRepository, AppUserRow } from './auth.repository';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: AuroraDsqlService,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiresInToMs(input: string): number {
    const value = input.trim().toLowerCase();
    const match = value.match(/^(\d+)([smhd])$/);

    if (!match) {
      throw new Error(`Invalid expires format: ${input}`);
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported expires unit: ${unit}`);
    }
  }

  private async buildTokens(user: AppUserRow) {
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    const accessExpiresInRaw =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpiresInRaw =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';

    if (!accessSecret || !refreshSecret) {
      throw new Error('Missing JWT secrets');
    }

    const accessExpiresIn = Math.floor(
      this.parseExpiresInToMs(accessExpiresInRaw) / 1000,
    );
    const refreshExpiresIn = Math.floor(
      this.parseExpiresInToMs(refreshExpiresInRaw) / 1000,
    );

    const accessPayload = {
      sub: user.user_id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
    };

    const refreshPayload = {
      sub: user.user_id,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
        jwtid: randomUUID(),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshExpiresInSeconds: refreshExpiresIn,
    };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.authRepository.findUserByLogin(dto.login);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    const passwordOk = await this.passwordService.verify(
      dto.password,
      user.password_hash,
    );

    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken, refreshExpiresInSeconds } =
      await this.buildTokens(user);

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.authRepository.createSession(client, {
        sessionId: randomUUID(),
        userId: user.user_id,
        refreshTokenHash,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      });

      await client.query('COMMIT');

      return {
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
        },
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async refresh(refreshToken: string) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!refreshSecret) {
      throw new Error('Missing JWT_REFRESH_SECRET');
    }

    let payload: { sub: string; type: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session =
      await this.authRepository.findActiveSessionByRefreshTokenHash(
        refreshTokenHash,
      );

    if (!session || session.user_id !== payload.sub) {
      throw new UnauthorizedException('Refresh session not found');
    }

    const user = await this.authRepository.findUserById(payload.sub);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not available');
    }

    const { accessToken, refreshToken: newRefreshToken, refreshExpiresInSeconds } =
      await this.buildTokens(user);

    const newRefreshHash = this.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + refreshExpiresInSeconds * 1000,
    );

    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await this.authRepository.revokeSessionById(client, session.session_id);

      await this.authRepository.createSession(client, {
        sessionId: randomUUID(),
        userId: user.user_id,
        refreshTokenHash: newRefreshHash,
        expiresAt: newExpiresAt,
      });

      await client.query('COMMIT');

      return {
        message: 'Token refreshed',
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
        },
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async me(userId: string) {
    const user = await this.authRepository.findPublicUserById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
    };
  }

  async logout(refreshToken: string) {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    await this.authRepository.revokeSessionByRefreshTokenHash(refreshTokenHash);

    return { message: 'Logged out' };
  }
}
