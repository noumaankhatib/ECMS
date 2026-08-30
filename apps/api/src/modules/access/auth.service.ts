import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import type { AuthenticatedUser, LoginResult } from './auth.types';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Signs a user in.
   *
   * Every failure path returns the same error and takes comparable time.
   * A wrong password, an unknown email, and a disabled account are
   * indistinguishable from the outside — otherwise the sign-in form becomes a
   * way to discover who works here.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalisedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email: normalisedEmail, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        status: true,
      },
    });

    // Runs against a decoy hash when there is no user, so the timing does not
    // reveal whether the address exists.
    const passwordMatches = await this.passwords.verify(password, user?.passwordHash ?? null);
    const permitted = user !== null && user.status === 'ACTIVE' && passwordMatches;

    if (!permitted) {
      await this.recordFailedAttempt(user?.id ?? null);
      throw appError('INVALID_CREDENTIALS', {
        // Logged, never returned. The caller learns nothing beyond "no".
        context: { email_attempted: normalisedEmail, user_found: user !== null },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const issued = await this.sessions.issue(tx, user.id);

      await this.audit.record(tx, {
        action: 'LOGGED_IN',
        entityType: 'User',
        entityId: user.id,
      });

      return {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token: issued.token,
        expiresAt: issued.expiresAt,
      };
    });
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revoke(tx, sessionId);
      await this.audit.record(tx, {
        action: 'LOGGED_OUT',
        entityType: 'User',
        entityId: userId,
      });
    });
  }

  async findActiveUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, email: true, displayName: true },
    });
    return user;
  }

  /**
   * A failed attempt is recorded whether or not the account exists — an
   * unrecognised address is exactly the pattern worth spotting later.
   */
  private async recordFailedAttempt(userId: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: userId ?? undefined,
        outcome: 'REJECTED',
      });
    });
  }
}
