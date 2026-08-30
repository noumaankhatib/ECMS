import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/modules/audit/audit.service';
import { runInRequestContext } from '../../src/shared/context/request-context';

/**
 * These tests exist to prove two claims that the whole system leans on:
 *
 *   1. An audit row and the change it describes share one transaction, so
 *      neither can exist without the other.
 *   2. The application cannot alter or erase history, because the database
 *      refuses it — not because the code chooses not to.
 *
 * Both are database behaviours. Mocking Prisma here would prove nothing.
 */
describe('audit trail', () => {
  const prisma = new PrismaClient({ datasourceUrl: process.env['DATABASE_URL'] as string });
  const audit = new AuditService();
  const requestId = '11111111-2222-4333-8444-555555555555';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes an entry that carries the request id from the surrounding context', async () => {
    const entityId = crypto.randomUUID();

    await runInRequestContext({ requestId }, async () => {
      await prisma.$transaction(async (tx) => {
        await audit.record(tx, { action: 'CREATED', entityType: 'Project', entityId });
      });
    });

    const row = await prisma.auditEntry.findFirst({ where: { entityId } });

    expect(row).not.toBeNull();
    // The same id appears on every log line for this request, which is what
    // makes a support question answerable from one search.
    expect(row?.requestId).toBe(requestId);
    expect(row?.outcome).toBe('SUCCEEDED');
  });

  it('records refusals, not only successes', async () => {
    const entityId = crypto.randomUUID();

    await runInRequestContext({ requestId }, async () => {
      await prisma.$transaction(async (tx) => {
        await audit.record(tx, {
          action: 'PERMISSION_DENIED',
          entityType: 'Project',
          entityId,
          outcome: 'REJECTED',
        });
      });
    });

    const row = await prisma.auditEntry.findFirst({ where: { entityId } });
    expect(row?.outcome).toBe('REJECTED');
  });

  it('rolls the audit entry back when the surrounding change fails', async () => {
    const entityId = crypto.randomUUID();

    await expect(
      runInRequestContext({ requestId }, async () =>
        prisma.$transaction(async (tx) => {
          await audit.record(tx, { action: 'CREATED', entityType: 'Project', entityId });
          // Whatever the business operation was, it failed after auditing.
          throw new Error('business rule failed');
        }),
      ),
    ).rejects.toThrow('business rule failed');

    // The audit row must be gone too. A change that never happened must not
    // leave a record claiming it did.
    const row = await prisma.auditEntry.findFirst({ where: { entityId } });
    expect(row).toBeNull();
  });

  it('cannot be altered by the application account', async () => {
    const entityId = crypto.randomUUID();
    await runInRequestContext({ requestId }, async () => {
      await prisma.$transaction(async (tx) => {
        await audit.record(tx, { action: 'CREATED', entityType: 'Project', entityId });
      });
    });

    await expect(
      prisma.auditEntry.updateMany({ where: { entityId }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot be deleted by the application account', async () => {
    const entityId = crypto.randomUUID();
    await runInRequestContext({ requestId }, async () => {
      await prisma.$transaction(async (tx) => {
        await audit.record(tx, { action: 'CREATED', entityType: 'Project', entityId });
      });
    });

    await expect(prisma.auditEntry.deleteMany({ where: { entityId } })).rejects.toThrow(
      /permission denied/i,
    );

    // And it is still there afterwards.
    expect(await prisma.auditEntry.count({ where: { entityId } })).toBe(1);
  });
});
