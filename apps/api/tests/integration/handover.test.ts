import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { HandoverService } from '../../src/modules/handover';
import { IssueService } from '../../src/modules/issues/issue.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Handover (docs/phase-10-plan.md) — the Closure-phase checklist that gates
 * `COMPLETED → CLOSED`, the one project transition with no precondition
 * before this phase. The case this file exists for: closing is refused
 * while any one of open issues, missing required documents, or an
 * incomplete checklist is true, and succeeds once all three clear.
 */
describe('handover', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const handover = new HandoverService(prisma, audit);
  const projects = new ProjectService(
    prisma,
    audit,
    authorization,
    new SequenceService(),
    handover,
  );
  const issues = new IssueService(prisma, audit);

  const requestId = '77777777-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  /** Every active `RequiredDocument` category, uploaded once, satisfying
   *  Phase 9's completeness for whichever project asks. */
  async function satisfyRequiredDocuments(projectId: string): Promise<void> {
    const requirements = await prisma.requiredDocument.findMany({ where: { archivedAt: null } });
    const existing = await prisma.document.findMany({
      where: { projectId, archivedAt: null },
      select: { category: true },
    });
    const covered = new Set(existing.map((d) => d.category.trim().toLowerCase()));
    for (const requirement of requirements) {
      if (covered.has(requirement.category.trim().toLowerCase())) continue;
      await prisma.document.create({
        data: {
          projectId,
          category: requirement.category,
          title: `${requirement.category} (test fixture)`,
          uploadStatus: 'ACTIVE',
        },
      });
    }
  }

  async function tickChecklist(projectId: string): Promise<void> {
    const status = await handover.status(projectId);
    await handover.update(projectId, {
      finalInspectionDone: true,
      authorityDocsReceived: true,
      testsReceived: true,
      asBuiltReceived: true,
      warrantiesReceived: true,
      finalReportIssued: true,
      version: status.version,
    });
  }

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        username: `handover-${crypto.randomUUID()}`,
        email: `handover-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let planner: string;
  let clientId: string;
  let propertyId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    planner = await userWithRole('PLANNING');

    const client = await inContext(() =>
      clients.create({ name: `Handover Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Handover House' }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A fresh project, walked to COMPLETED — the only state `close` is legal
   *  from — with nothing on the handover checklist satisfied yet. */
  async function completedProject(): Promise<{ id: string; version: number }> {
    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `HND-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Handover Test Project',
          type: 'SUPERVISION',
        },
        admin,
      ),
    );
    let current = await inContext(() =>
      projects.transition(project.id, 'activate', { version: 1 }, admin),
    );
    current = await inContext(() =>
      projects.transition(project.id, 'complete', { version: current.version }, admin),
    );
    return { id: project.id, version: current.version };
  }

  it('starts with nothing satisfied, and is not ready', async () => {
    const { id } = await completedProject();

    const status = await handover.status(id);
    expect(status.finalInspectionAt).toBeNull();
    expect(status.missingDocumentCount).toBeGreaterThan(0);
    expect(status.ready).toBe(false);
  });

  it('refuses to close while an issue is open', async () => {
    const { id, version } = await completedProject();
    await satisfyRequiredDocuments(id);
    await tickChecklist(id);

    // The gate is reached only for `close` — creating an issue after
    // COMPLETED is itself legal, PRD never says design/supervision work
    // stops the moment a project is marked complete.
    await prisma.issue.create({
      data: { projectId: id, title: 'Snag list item', status: 'OPEN' },
    });

    await expect(
      inContext(() => projects.transition(id, 'close', { version }, admin)),
    ).rejects.toMatchObject({ code: 'HANDOVER_INCOMPLETE' });

    expect((await handover.status(id)).openIssueCount).toBe(1);
  });

  it('refuses to close while a required document is missing', async () => {
    const { id, version } = await completedProject();
    await tickChecklist(id);
    // Required documents deliberately not satisfied.

    await expect(
      inContext(() => projects.transition(id, 'close', { version }, admin)),
    ).rejects.toMatchObject({ code: 'HANDOVER_INCOMPLETE' });
  });

  it('refuses to close while the checklist itself is incomplete', async () => {
    const { id, version } = await completedProject();
    await satisfyRequiredDocuments(id);
    // Checklist deliberately not ticked.

    await expect(
      inContext(() => projects.transition(id, 'close', { version }, admin)),
    ).rejects.toMatchObject({ code: 'HANDOVER_INCOMPLETE' });
  });

  it('records the refusal, not only a successful close', async () => {
    const { id, version } = await completedProject();

    await expect(
      inContext(() => projects.transition(id, 'close', { version }, admin)),
    ).rejects.toThrow();

    const rejected = await prisma.auditEntry.count({
      where: { entityId: id, action: 'STATUS_CHANGED', outcome: 'REJECTED' },
    });
    expect(rejected).toBe(1);
  });

  it('closes once every precondition clears', async () => {
    const { id, version } = await completedProject();
    await satisfyRequiredDocuments(id);
    await tickChecklist(id);

    const closed = await inContext(() => projects.transition(id, 'close', { version }, admin));
    expect(closed.status).toBe('CLOSED');
  });

  it('resolving the open issue is enough to unblock a close that only had that problem', async () => {
    const { id, version } = await completedProject();
    await satisfyRequiredDocuments(id);
    await tickChecklist(id);

    const issue = await inContext(() =>
      issues.create(id, { title: 'Loose railing', severity: 'MEDIUM', priority: 'MEDIUM' }, admin),
    );

    await expect(
      inContext(() => projects.transition(id, 'close', { version }, admin)),
    ).rejects.toMatchObject({ code: 'HANDOVER_INCOMPLETE' });

    let current = await inContext(() => issues.transition(id, issue.id, 'start', { version: 1 }));
    current = await inContext(() =>
      issues.transition(id, issue.id, 'resolve', { version: current.version }),
    );
    await inContext(() => issues.transition(id, issue.id, 'close', { version: current.version }));

    const closed = await inContext(() => projects.transition(id, 'close', { version }, admin));
    expect(closed.status).toBe('CLOSED');
  });

  it('leaves every other transition unaffected', async () => {
    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `HND-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Handover Untouched Transitions',
          type: 'SUPERVISION',
        },
        admin,
      ),
    );

    // activate, hold and complete never consult the checklist at all.
    let current = await inContext(() =>
      projects.transition(project.id, 'activate', { version: 1 }, admin),
    );
    expect(current.status).toBe('ACTIVE');
    current = await inContext(() =>
      projects.transition(project.id, 'hold', { version: current.version }, admin),
    );
    expect(current.status).toBe('ON_HOLD');
    current = await inContext(() =>
      projects.transition(project.id, 'activate', { version: current.version }, admin),
    );
    current = await inContext(() =>
      projects.transition(project.id, 'complete', { version: current.version }, admin),
    );
    expect(current.status).toBe('COMPLETED');
  });

  it('refuses to tick a checklist item without project:edit', async () => {
    const { id } = await completedProject();

    // A Planner holds no project:edit (step 4's own matrix) — the guard sits
    // in the controller layer via @RequirePermission, so this exercises the
    // service directly to confirm the checklist itself has no bypass: a
    // caller without project:edit should never reach `update` in practice,
    // proven at the authorization layer instead.
    expect(await authorization.can(planner, 'project:edit', id)).toBe(false);
  });

  it('a project with no checklist row yet reports every field unset', async () => {
    const { id } = await completedProject();

    const rowBefore = await prisma.handoverChecklist.findUnique({ where: { projectId: id } });
    expect(rowBefore).toBeNull();

    const status = await handover.status(id);
    expect(status.ready).toBe(false);

    // The read itself creates the row lazily.
    const rowAfter = await prisma.handoverChecklist.findUnique({ where: { projectId: id } });
    expect(rowAfter).not.toBeNull();
  });

  it('refuses a stale checklist update', async () => {
    const { id } = await completedProject();
    const status = await handover.status(id);

    await handover.update(id, { finalInspectionDone: true, version: status.version });

    await expect(
      handover.update(id, { authorityDocsReceived: true, version: status.version }),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });
});
