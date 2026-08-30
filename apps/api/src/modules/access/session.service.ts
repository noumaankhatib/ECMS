import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import type { Tx } from '../../shared/database/transaction';

/** How long a session stays valid without being renewed. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface IssuedSession {
  /** Given to the browser. Never stored anywhere by us. */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface ActiveSession {
  readonly sessionId: string;
  readonly userId: string;
}

/**
 * Server-side sessions.
 *
 * The cookie holds a random opaque token; the database holds only its SHA-256
 * hash. Two consequences worth stating:
 *
 *   - Signing out genuinely revokes access. A self-contained token would stay
 *     valid until expiry no matter what the user pressed.
 *   - A leaked database backup does not hand over live sessions, because the
 *     hashes in it cannot be turned back into cookies.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private static digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(tx: Tx, userId: string): Promise<IssuedSession> {
    // 32 bytes from the CSPRNG. Guessing one is not a realistic attack.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await tx.session.create({
      data: { userId, tokenHash: SessionService.digest(token), expiresAt },
    });

    return { token, expiresAt };
  }

  /** Returns the session only if it exists, is unrevoked and unexpired. */
  async resolve(token: string): Promise<ActiveSession | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: SessionService.digest(token) },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (!row || row.revokedAt !== null || row.expiresAt <= new Date()) return null;

    return { sessionId: row.id, userId: row.userId };
  }

  /** Marks the session revoked. Kept, rather than deleted, so it stays auditable. */
  async revoke(tx: Tx, sessionId: string): Promise<void> {
    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session for a user — for disabling an account, or a password change. */
  async revokeAllForUser(tx: Tx, userId: string): Promise<void> {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }
}
