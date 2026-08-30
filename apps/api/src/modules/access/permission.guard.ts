import type { Permission } from '@ecms/contracts';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';

import { AuthorizationService } from './authorization.service';
import { REQUIRED_PERMISSION, REQUIRED_PERMISSION_ANYWHERE } from './require-permission.decorator';

/**
 * Enforces whatever @RequirePermission declared.
 *
 * The project is taken from the route (`:projectId`) or the request body, so a
 * project-scoped permission is always checked against the project actually
 * being touched — never against some other project the caller happens to belong
 * to.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    const anywhere = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION_ANYWHERE,
      [context.getHandler(), context.getClass()],
    );

    // No declaration means the route is not permission-gated. It is still
    // behind AuthGuard, so it is not public.
    if (!required && !anywhere) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.currentUser;
    if (!user) throw appError('UNAUTHENTICATED');

    if (required) {
      await this.authorization.require(user.id, required, resolveProjectId(request));
    }
    if (anywhere) {
      // A list route. This only establishes that the caller holds the
      // permission somewhere; the handler's query is what scopes the rows.
      await this.authorization.requireAnywhere(user.id, anywhere);
    }
    return true;
  }
}

function resolveProjectId(request: Request): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  const body = request.body as Record<string, unknown> | undefined;

  const candidate = params['projectId'] ?? params['id'] ?? body?.['projectId'];
  return typeof candidate === 'string' ? candidate : undefined;
}
