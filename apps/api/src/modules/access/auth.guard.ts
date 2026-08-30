import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { setContextUserId } from '../../shared/context/request-context';
import { appError } from '../../shared/errors/app-error';

import { SESSION_COOKIE } from './auth.cookie';
import { AuthService } from './auth.service';
import { IS_PUBLIC } from './public.decorator';
import { SessionService } from './session.service';

/**
 * Applied globally, so every route requires a signed-in user unless it is
 * explicitly marked @Public.
 *
 * Deny-by-default is the point. Requiring an opt-out means a new endpoint is
 * protected by the fact that someone wrote it, rather than by them remembering
 * to add a guard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw appError('UNAUTHENTICATED');

    const session = await this.sessions.resolve(token);
    if (!session) throw appError('UNAUTHENTICATED');

    // Re-read the user on every request rather than trusting the session row.
    // An account disabled a minute ago must stop working now, not when the
    // session happens to expire.
    const user = await this.auth.findActiveUser(session.userId);
    if (!user) throw appError('UNAUTHENTICATED');

    request.currentUser = user;
    request.sessionId = session.sessionId;

    // Makes the actor available to logging and to the audit writer, so nothing
    // has to pass it down by hand.
    setContextUserId(user.id);

    return true;
  }
}
