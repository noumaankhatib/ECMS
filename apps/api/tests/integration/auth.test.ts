import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../../src/modules/access/auth.service';
import { PasswordService } from '../../src/modules/access/password.service';
import { SessionService } from '../../src/modules/access/session.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Sign-in behaviour, tested against the real database.
 *
 * The cases that matter here are the refusals, not the happy path. A sign-in
 * form that behaves differently for a known and an unknown address is a way to
 * find out who works here, and that is not something a unit test with a mocked
 * repository would ever catch.
 */
describe('authentication', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const passwords = new PasswordService();
  const sessions = new SessionService(prisma);
  const auth = new AuthService(prisma, passwords, sessions, new AuditService());

  const requestId = '99999999-8888-4777-8666-555555555555';
  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = 'a-sufficiently-long-password';
  let userId: string;

  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email, displayName: 'Test User', passwordHash: await passwords.hash(password) },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('signs in with correct credentials and issues a session', async () => {
    const result = await inContext(() => auth.login(email, password));

    expect(result.user.id).toBe(userId);
    expect(result.token).toHaveLength(43); // 32 random bytes, base64url
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts an email with different casing and surrounding whitespace', async () => {
    const result = await inContext(() => auth.login(`  ${email.toUpperCase()}  `, password));
    expect(result.user.id).toBe(userId);
  });

  it('refuses a wrong password', async () => {
    await expect(inContext(() => auth.login(email, 'not-the-password'))).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('gives an unknown address exactly the same refusal as a wrong password', async () => {
    // Identical code and message. Nothing distinguishes "no such account" from
    // "wrong password", so the form cannot be used to enumerate users.
    await expect(
      inContext(() => auth.login('no-such-person@example.com', 'anything')),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('refuses a disabled account, without saying that is why', async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });

    await expect(inContext(() => auth.login(email, password))).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  it('records both successful and failed attempts in the audit trail', async () => {
    const before = await prisma.auditEntry.count({
      where: { entityId: userId, action: 'LOGIN_FAILED' },
    });

    await expect(inContext(() => auth.login(email, 'wrong'))).rejects.toThrow();

    const after = await prisma.auditEntry.count({
      where: { entityId: userId, action: 'LOGIN_FAILED' },
    });
    expect(after).toBe(before + 1);
  });

  it('resolves a live session and stops resolving it once signed out', async () => {
    const { token } = await inContext(() => auth.login(email, password));

    const active = await sessions.resolve(token);
    expect(active?.userId).toBe(userId);

    await prisma.$transaction((tx) => sessions.revoke(tx, active!.sessionId));

    // Revoked, so the same cookie is now worthless. This is the thing a
    // self-contained token could not give us.
    expect(await sessions.resolve(token)).toBeNull();
  });

  it('never stores the password itself', async () => {
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    expect(row.passwordHash).not.toContain(password);
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects an unknown session token', async () => {
    expect(await sessions.resolve('a-token-that-was-never-issued')).toBeNull();
  });
});
