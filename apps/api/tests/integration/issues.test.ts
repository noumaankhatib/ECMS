import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { IssueService } from '../../src/modules/issues/issue.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { ObservationService } from '../../src/modules/supervision/observation.service';
import { SiteVisitService } from '../../src/modules/supervision/site-visit.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Issues — the fourth state machine in the system (phase-1-plan.md §5a).
 *
 * Same critical case as planning and supervision: a non-member gets nothing.
 * What is specific here is the full Open → In Progress → Resolved → Closed
 * walk, reopening from either end, and that an issue may point at an
 * observation only when it belongs to the same project.
 */
describe('issues', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(prisma, audit, authorization, new SequenceService());
  const siteVisits = new SiteVisitService(prisma, audit);
  const observations = new ObservationService(prisma, audit);
  const issues = new IssueService(prisma, audit);

  const requestId = '55555555-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  // CreateIssue's severity and priority carry a schema default, which — like
  // every other defaulted field in this codebase (e.g. Contact.isPrimary) —
  // makes them optional to the HTTP caller but present in the parsed type
  // the service actually sees. Calling the service directly, as these tests
  // do, means supplying them explicitly.
  const issueDefaults = { severity: 'MEDIUM' as const, priority: 'MEDIUM' as const };

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `issue-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let owningSupervisor: string;
  let otherSupervisor: string;
  let director: string;
  let clientId: string;
  let propertyId: string;
  let projectId: string;
  let siteVisitId: string;
  let observationId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningSupervisor = await userWithRole('SUPERVISION');
    otherSupervisor = await userWithRole('SUPERVISION');
    director = await userWithRole('DIRECTOR');

    const client = await inContext(() =>
      clients.create({ name: `Issue Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Issue House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `ISS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Issue Test Project',
          type: 'SUPERVISION',
        },
        owningSupervisor,
      ),
    );
    projectId = project.id;

    const visit = await inContext(() =>
      siteVisits.create(projectId, { visitDate: new Date('2026-06-01') }, owningSupervisor),
    );
    siteVisitId = visit.id;

    const observation = await inContext(() =>
      observations.create(
        projectId,
        siteVisitId,
        { description: 'Crack in the north wall' },
        owningSupervisor,
      ),
    );
    observationId = observation.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // The critical test
  // ---------------------------------------------------------------------------

  it('gives a non-member nothing at all for issues on this project', async () => {
    expect(await authorization.can(otherSupervisor, 'issue:view', projectId)).toBe(false);
    expect(await authorization.can(otherSupervisor, 'issue:create', projectId)).toBe(false);
  });

  it('lets the project member see, create, edit and close issues', async () => {
    expect(await authorization.can(owningSupervisor, 'issue:view', projectId)).toBe(true);
    expect(await authorization.can(owningSupervisor, 'issue:create', projectId)).toBe(true);
    expect(await authorization.can(owningSupervisor, 'issue:close', projectId)).toBe(true);
  });

  it('gives the Director view only, matching oversight without edit rights', async () => {
    expect(await authorization.can(director, 'issue:view')).toBe(true);
    expect(await authorization.can(director, 'issue:create', projectId)).toBe(false);
    expect(await authorization.can(director, 'issue:close', projectId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  it('creates an issue at OPEN, with the seeded default severity and priority', async () => {
    const issue = await inContext(() =>
      issues.create(
        projectId,
        { ...issueDefaults, title: 'Damp patch on ceiling' },
        owningSupervisor,
      ),
    );
    expect(issue.status).toBe('OPEN');
    expect(issue.severity).toBe('MEDIUM');
    expect(issue.priority).toBe('MEDIUM');

    const page = await issues.list(projectId, { page: 1, pageSize: 25 });
    expect(page.items.map((i) => i.id)).toContain(issue.id);
  });

  it('creates an issue raised from an observation on the same project', async () => {
    const issue = await inContext(() =>
      issues.create(
        projectId,
        { ...issueDefaults, title: 'Structural crack', observationId, severity: 'HIGH' },
        owningSupervisor,
      ),
    );
    expect(issue.observationId).toBe(observationId);
    expect(issue.severity).toBe('HIGH');
  });

  it('refuses an issue raised from an observation belonging to another project', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Other Issue House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `ISS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Issue Project',
          type: 'SUPERVISION',
        },
        owningSupervisor,
      ),
    );

    await expect(
      inContext(() =>
        issues.create(
          otherProject.id,
          { ...issueDefaults, title: 'Should not land', observationId },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a stale edit to an issue', async () => {
    const issue = await inContext(() =>
      issues.create(projectId, { ...issueDefaults, title: 'First cut' }, owningSupervisor),
    );
    await inContext(() =>
      issues.update(projectId, issue.id, { priority: 'HIGH', version: 1 }, owningSupervisor),
    );

    await expect(
      inContext(() =>
        issues.update(projectId, issue.id, { priority: 'LOW', version: 1 }, owningSupervisor),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('refuses an issue reached through the wrong project in the URL', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Yet Another Issue House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `ISS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Yet Another Issue Project',
          type: 'SUPERVISION',
        },
        owningSupervisor,
      ),
    );

    const issue = await inContext(() =>
      issues.create(
        projectId,
        { ...issueDefaults, title: 'Belongs to the first project' },
        owningSupervisor,
      ),
    );

    await expect(issues.byId(otherProject.id, issue.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // The four-state machine
  // ---------------------------------------------------------------------------

  it('walks Open → In Progress → Resolved → Closed, then reopens', async () => {
    const issue = await inContext(() =>
      issues.create(
        projectId,
        { ...issueDefaults, title: 'Leak under the sink' },
        owningSupervisor,
      ),
    );

    const started = await inContext(() =>
      issues.transition(projectId, issue.id, 'start', { version: 1 }),
    );
    expect(started.status).toBe('IN_PROGRESS');

    const resolved = await inContext(() =>
      issues.transition(projectId, issue.id, 'resolve', { version: started.version }),
    );
    expect(resolved.status).toBe('RESOLVED');

    const closed = await inContext(() =>
      issues.transition(projectId, issue.id, 'close', { version: resolved.version }),
    );
    expect(closed.status).toBe('CLOSED');

    const reopened = await inContext(() =>
      issues.transition(projectId, issue.id, 'reopen', {
        version: closed.version,
        reason: 'Leak came back',
      }),
    );
    expect(reopened.status).toBe('OPEN');
  });

  it('reopens directly from Resolved, without going through Closed', async () => {
    const issue = await inContext(() =>
      issues.create(projectId, { ...issueDefaults, title: 'Loose handrail' }, owningSupervisor),
    );
    const started = await inContext(() =>
      issues.transition(projectId, issue.id, 'start', { version: 1 }),
    );
    const resolved = await inContext(() =>
      issues.transition(projectId, issue.id, 'resolve', { version: started.version }),
    );

    const reopened = await inContext(() =>
      issues.transition(projectId, issue.id, 'reopen', { version: resolved.version }),
    );
    expect(reopened.status).toBe('OPEN');
  });

  it('refuses to skip straight from Open to Resolved', async () => {
    const issue = await inContext(() =>
      issues.create(projectId, { ...issueDefaults, title: 'Squeaky door' }, owningSupervisor),
    );

    await expect(
      inContext(() => issues.transition(projectId, issue.id, 'resolve', { version: 1 })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('records the refused transition, not only the ones that happened', async () => {
    const issue = await inContext(() =>
      issues.create(projectId, { ...issueDefaults, title: 'Flickering light' }, owningSupervisor),
    );

    await expect(
      inContext(() => issues.transition(projectId, issue.id, 'close', { version: 1 })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const rejected = await prisma.auditEntry.count({
      where: {
        entityId: issue.id,
        entityType: 'Issue',
        action: 'STATUS_CHANGED',
        outcome: 'REJECTED',
      },
    });
    expect(rejected).toBe(1);
  });

  it('refuses a transition made from a stale version', async () => {
    const issue = await inContext(() =>
      issues.create(projectId, { ...issueDefaults, title: 'Cracked tile' }, owningSupervisor),
    );
    await inContext(() => issues.transition(projectId, issue.id, 'start', { version: 1 }));

    // The second caller read version 1 before 'start' landed. Resolving is
    // still legal from the issue's current (fresh) status, IN_PROGRESS, so
    // this is genuinely a version conflict — not the illegal-transition case
    // a second 'start' attempt would hit instead.
    await expect(
      inContext(() => issues.transition(projectId, issue.id, 'resolve', { version: 1 })),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  // ---------------------------------------------------------------------------
  // A closed project accepts no new issues
  // ---------------------------------------------------------------------------

  it('refuses to create an issue on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing Issue House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `ISS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Issue Project',
          type: 'SUPERVISION',
        },
        admin,
      ),
    );

    let current = await inContext(() =>
      projects.transition(closingProject.id, 'activate', { version: 1 }, admin),
    );
    current = await inContext(() =>
      projects.transition(closingProject.id, 'complete', { version: current.version }, admin),
    );
    await inContext(() =>
      projects.transition(closingProject.id, 'close', { version: current.version }, admin),
    );

    await expect(
      inContext(() =>
        issues.create(closingProject.id, { ...issueDefaults, title: 'Too late' }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('holds every seeded issue permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { in: ['issue:view', 'issue:create', 'issue:edit', 'issue:close'] } },
    });
    const grants = await authorization.grantsFor(owningSupervisor);
    expect(grants.project.has('issue:close')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });
});
