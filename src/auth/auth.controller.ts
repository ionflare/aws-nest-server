import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
    email: string;
    displayName: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshCookieName() {
    return this.configService.get<string>('AUTH_REFRESH_COOKIE_NAME') ?? 'bg_refresh_token';
  }

  private getCookieOptions() {
    const sameSite =
      (this.configService.get<string>('AUTH_COOKIE_SAME_SITE') ?? 'lax') as
        | 'lax'
        | 'strict'
        | 'none';

    const secure =
      (this.configService.get<string>('AUTH_COOKIE_SECURE') ?? 'false') === 'true';

    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
    } as const;
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, ip, userAgent);

    response.cookie(this.getRefreshCookieName(), result.refreshToken, {
      ...this.getCookieOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      message: result.message,
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[this.getRefreshCookieName()];

    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }

    const result = await this.authService.refresh(refreshToken);

    response.cookie(this.getRefreshCookieName(), result.refreshToken, {
      ...this.getCookieOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      message: result.message,
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[this.getRefreshCookieName()];

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    response.clearCookie(this.getRefreshCookieName(), this.getCookieOptions());

    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.sub);
  }
}
