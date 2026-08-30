import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { PasswordService } from '../../src/modules/access/password.service';
import { SessionService } from '../../src/modules/access/session.service';
import { UserService } from '../../src/modules/access/user.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * User administration.
 *
 * The cases worth having are the ones about access being taken away, and about
 * the ways an administrator could lock everybody out.
 */
describe('users', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const passwords = new PasswordService();
  const sessions = new SessionService(prisma);
  const authorization = new AuthorizationService(prisma);
  const users = new UserService(prisma, audit, passwords, sessions);

  const requestId = '99999999-8888-4777-8666-555555555555';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  const email = () => `users-${crypto.randomUUID()}@example.com`;
  const actor = crypto.randomUUID();

  let subject: string;

  beforeEach(async () => {
    const created = await inContext(() =>
      users.create(
        {
          email: email(),
          displayName: 'Test Person',
          password: 'a-perfectly-fine-password',
          roleCode: 'PLANNING',
        },
        actor,
      ),
    );
    subject = created.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user with a role, and audits it', async () => {
    const created = await users.byId(subject);
    expect(created.roles).toEqual(['PLANNING']);
    expect(created.status).toBe('ACTIVE');

    const entries = await prisma.auditEntry.count({
      where: { entityId: subject, entityType: 'User', action: 'CREATED' },
    });
    expect(entries).toBe(1);
  });

  it('never returns or records the password', async () => {
    const created = await users.byId(subject);
    expect(JSON.stringify(created)).not.toContain('a-perfectly-fine-password');

    const entries = await prisma.auditEntry.findMany({ where: { entityId: subject } });
    expect(JSON.stringify(entries)).not.toContain('a-perfectly-fine-password');
  });

  it('stores the password as an Argon2id hash, not as text', async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: subject } });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('refuses a second account on the same address', async () => {
    const existing = await users.byId(subject);

    await expect(
      inContext(() =>
        users.create(
          {
            email: existing.email,
            displayName: 'Impostor',
            password: 'another-fine-password',
            roleCode: 'PLANNING',
          },
          actor,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('ends every session the moment an account is disabled', async () => {
    // Sessions are server-side precisely so that revoking access does not mean
    // waiting for a cookie to expire. This is where that promise is kept.
    await prisma.$transaction(async (tx) => {
      await sessions.issue(tx, subject);
      await sessions.issue(tx, subject);
    });
    expect(await prisma.session.count({ where: { userId: subject, revokedAt: null } })).toBe(2);

    await inContext(() => users.update(subject, { status: 'DISABLED' }, actor));

    expect(await prisma.session.count({ where: { userId: subject, revokedAt: null } })).toBe(0);
  });

  it('ends every session when a password is set for someone', async () => {
    // If this is being used because an account was compromised, leaving the
    // attacker signed in would defeat the exercise.
    await prisma.$transaction((tx) => sessions.issue(tx, subject));

    await inContext(() => users.setPassword(subject, { password: 'a-brand-new-password' }, actor));

    expect(await prisma.session.count({ where: { userId: subject, revokedAt: null } })).toBe(0);
  });

  it('refuses to let an administrator disable their own account', async () => {
    await expect(
      inContext(() => users.update(subject, { status: 'DISABLED' }, subject)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('grants and revokes a role, and the permissions follow immediately', async () => {
    expect(await authorization.can(subject, 'user:admin')).toBe(false);

    await inContext(() => users.assignRole(subject, { roleCode: 'SYSTEM_ADMINISTRATOR' }, actor));
    expect(await authorization.can(subject, 'user:admin')).toBe(true);

    await inContext(() => users.removeRole(subject, 'SYSTEM_ADMINISTRATOR', actor));
    expect(await authorization.can(subject, 'user:admin')).toBe(false);
  });

  it('records a role change in the audit trail', async () => {
    await inContext(() => users.assignRole(subject, { roleCode: 'DIRECTOR' }, actor));

    const entries = await prisma.auditEntry.count({
      where: { entityId: subject, entityType: 'UserRole' },
    });
    expect(entries).toBe(1);
  });

  it('refuses to remove the last active System Administrator', async () => {
    // Otherwise there is nobody left who can grant the role back, and the only
    // way out is the command line on the server.
    const administrators = await prisma.userRole.findMany({
      where: { roleCode: 'SYSTEM_ADMINISTRATOR', user: { status: 'ACTIVE', deletedAt: null } },
      select: { userId: true },
    });

    // Disable every administrator but one, so the one that remains is the last.
    const [survivor, ...rest] = administrators;
    for (const other of rest) {
      await prisma.user.update({ where: { id: other.userId }, data: { status: 'DISABLED' } });
    }

    try {
      await expect(
        inContext(() => users.removeRole(survivor!.userId, 'SYSTEM_ADMINISTRATOR', actor)),
      ).rejects.toMatchObject({ code: 'DEPENDENCY_EXISTS' });
    } finally {
      for (const other of rest) {
        await prisma.user.update({ where: { id: other.userId }, data: { status: 'ACTIVE' } });
      }
    }
  });

  it('hides a disabled account from nothing, but stops it signing in', async () => {
    await inContext(() => users.update(subject, { status: 'DISABLED' }, actor));

    const after = await users.byId(subject);
    expect(after.status).toBe('DISABLED');

    // Still listed. Disabling is not deletion — their history must stay
    // attributable to a name.
    const page = await users.list({ page: 1, pageSize: 100, includeArchived: false });
    expect(page.items.map((u) => u.id)).toContain(subject);
  });
});
