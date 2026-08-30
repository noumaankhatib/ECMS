import { loginRequestSchema, type CurrentUserResponse, type LoginRequest } from '@ecms/contracts';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UsePipes } from '@nestjs/common';
import type { Request, Response } from 'express';

import { appError } from '../../shared/errors/app-error';
import { RateLimiter } from '../../shared/http/rate-limit';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';

import { clearSessionCookie, SESSION_COOKIE, sessionCookieOptions } from './auth.cookie';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { AuthorizationService } from './authorization.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: AuthorizationService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  async login(
    @Body() body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    // Limited per address AND per source, so one account cannot be ground down
    // from many machines, and one machine cannot work through many accounts.
    // Ten attempts in fifteen minutes is generous for a person and hopeless for
    // a guessing attack (PRD §14).
    const emailKey = `login:email:${body.email}`;
    const ipKey = `login:ip:${req.ip ?? 'unknown'}`;
    this.rateLimiter.consume(emailKey, 10, 15 * 60_000);
    this.rateLimiter.consume(ipKey, 30, 15 * 60_000);

    const result = await this.auth.login(body.email, body.password);

    // Cleared on success: a person who mistyped their password twice should not
    // carry those attempts for the next quarter of an hour.
    this.rateLimiter.reset(emailKey);

    // The session travels in an httpOnly cookie, never in the response body.
    // Nothing in the browser's JavaScript can read it, so a scripting flaw
    // cannot carry it away.
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));

    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (req.sessionId && req.currentUser) {
      await this.auth.logout(req.sessionId, req.currentUser.id);
    }
    clearSessionCookie(res);
  }

  /**
   * Who is signed in, and what they may do.
   *
   * The grants are sent so the interface can hide what the person cannot do.
   * That is a courtesy and nothing more — every one of them is enforced again
   * by the API on the way in. A hidden button prevents confusion; the server
   * check is what prevents access (PRD §8, §16).
   */
  @Get('me')
  async me(@Req() req: Request): Promise<CurrentUserResponse> {
    // The guard has already run, so this is defensive only.
    if (!req.currentUser) throw appError('UNAUTHENTICATED');

    const grants = await this.authorization.grantsFor(req.currentUser.id);

    return {
      user: req.currentUser,
      grants: { global: [...grants.global], project: [...grants.project] },
    };
  }
}
