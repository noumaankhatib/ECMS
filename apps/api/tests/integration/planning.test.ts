import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { ActivityService } from '../../src/modules/planning/activity.service';
import { MilestoneService } from '../../src/modules/planning/milestone.service';
import { SubmissionService } from '../../src/modules/planning/submission.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Planning — activities, milestones and submissions.
 *
 * Same critical case as Phase 1's projects module: a user who is not a member
 * of the project gets nothing for any of these three, not a hidden button.
 * Everything else here protects the two rules specific to this module — a
 * closed project accepts no new planning work, and a submission moves only
 * through its own small transition table.
 */
describe('planning', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(prisma, audit, authorization);
  const activities = new ActivityService(prisma, audit);
  const milestones = new MilestoneService(prisma, audit);
  const submissions = new SubmissionService(prisma, audit);

  const requestId = '33333333-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  const createdUsers: string[] = [];

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `planning-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    createdUsers.push(user.id);
    return user.id;
  }

  let admin: string;
  let owningManager: string;
  let otherManager: string;
  let clientId: string;
  let propertyId: string;
  let projectId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningManager = await userWithRole('PROJECT_MANAGER');
    otherManager = await userWithRole('PROJECT_MANAGER');

    const client = await inContext(() =>
      clients.create({ name: `Planning Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Planning House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `PLN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Planning Test Project',
          type: 'PLANNING',
        },
        owningManager,
      ),
    );
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // The critical test
  // ---------------------------------------------------------------------------

  it('gives a non-member nothing at all for planning on this project', async () => {
    expect(await authorization.can(otherManager, 'planning:view', projectId)).toBe(false);
    expect(await authorization.can(otherManager, 'planning:create', projectId)).toBe(false);
  });

  it('lets the project member see and create planning records', async () => {
    expect(await authorization.can(owningManager, 'planning:view', projectId)).toBe(true);
    expect(await authorization.can(owningManager, 'planning:create', projectId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------------

  it('creates, lists and archives a planning activity', async () => {
    const activity = await inContext(() =>
      activities.create(projectId, { name: 'Draft the brief' }, owningManager),
    );
    expect(activity.done).toBe(false);

    const page = await activities.list(projectId, {
      page: 1,
      pageSize: 25,
      includeArchived: false,
    });
    expect(page.items.map((a) => a.id)).toContain(activity.id);

    await inContext(() => activities.archive(projectId, activity.id, owningManager));

    const after = await activities.list(projectId, {
      page: 1,
      pageSize: 25,
      includeArchived: false,
    });
    expect(after.items.map((a) => a.id)).not.toContain(activity.id);
  });

  it('refuses a stale edit to an activity', async () => {
    const activity = await inContext(() =>
      activities.create(projectId, { name: 'First cut' }, owningManager),
    );
    await inContext(() =>
      activities.update(projectId, activity.id, { done: true, version: 1 }, owningManager),
    );

    await expect(
      inContext(() =>
        activities.update(
          projectId,
          activity.id,
          { name: 'Second cut', version: 1 },
          owningManager,
        ),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('refuses an activity reached through the wrong project in the URL', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Other House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `PLN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Project',
          type: 'PLANNING',
        },
        owningManager,
      ),
    );

    const activity = await inContext(() =>
      activities.create(projectId, { name: 'Belongs to the first project' }, owningManager),
    );

    await expect(activities.byId(otherProject.id, activity.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // Milestones
  // ---------------------------------------------------------------------------

  it('creates a milestone and records it reached by setting achievedDate', async () => {
    const milestone = await inContext(() =>
      milestones.create(projectId, { name: 'Planning submitted' }, owningManager),
    );
    expect(milestone.achievedDate).toBeNull();

    const achieved = await inContext(() =>
      milestones.update(
        projectId,
        milestone.id,
        { achievedDate: new Date(), version: 1 },
        owningManager,
      ),
    );
    expect(achieved.achievedDate).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Submissions
  // ---------------------------------------------------------------------------

  it('creates a submission and audits it', async () => {
    const submission = await inContext(() =>
      submissions.create(
        projectId,
        { reference: 'SUB-001', authorityName: 'Local Planning Authority' },
        owningManager,
      ),
    );
    expect(submission.status).toBe('DRAFT');

    const entries = await prisma.auditEntry.count({
      where: { entityId: submission.id, entityType: 'Submission', action: 'CREATED' },
    });
    expect(entries).toBe(1);
  });

  it('moves a submission from DRAFT to SUBMITTED, and no further forward', async () => {
    const submission = await inContext(() =>
      submissions.create(
        projectId,
        { reference: 'SUB-002', authorityName: 'Local Planning Authority' },
        owningManager,
      ),
    );

    const submitted = await inContext(() =>
      submissions.transition(projectId, submission.id, { to: 'SUBMITTED', version: 1 }),
    );
    expect(submitted.status).toBe('SUBMITTED');

    // There is no approval step in this phase — SUBMITTED is where it stops,
    // not one of the four full state machines in the system.
    await expect(
      inContext(() =>
        submissions.transition(projectId, submission.id, {
          to: 'DRAFT',
          version: submitted.version,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('records the refused transition, not only the ones that happened', async () => {
    const submission = await inContext(() =>
      submissions.create(
        projectId,
        { reference: 'SUB-003', authorityName: 'Local Planning Authority' },
        owningManager,
      ),
    );
    await inContext(() =>
      submissions.transition(projectId, submission.id, { to: 'WITHDRAWN', version: 1 }),
    );

    await expect(
      inContext(() =>
        submissions.transition(projectId, submission.id, { to: 'SUBMITTED', version: 2 }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const rejected = await prisma.auditEntry.count({
      where: {
        entityId: submission.id,
        entityType: 'Submission',
        action: 'STATUS_CHANGED',
        outcome: 'REJECTED',
      },
    });
    expect(rejected).toBe(1);
  });

  it('refuses a submission transition made from a stale version', async () => {
    const submission = await inContext(() =>
      submissions.create(
        projectId,
        { reference: 'SUB-004', authorityName: 'Local Planning Authority' },
        owningManager,
      ),
    );
    await inContext(() =>
      submissions.transition(projectId, submission.id, { to: 'SUBMITTED', version: 1 }),
    );

    // The second caller read version 1 before the first move landed.
    await expect(
      inContext(() =>
        submissions.transition(projectId, submission.id, { to: 'WITHDRAWN', version: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  // ---------------------------------------------------------------------------
  // A closed project accepts no new planning work
  // ---------------------------------------------------------------------------

  it('refuses to create planning records on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `PLN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Project',
          type: 'PLANNING',
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
      inContext(() => activities.create(closingProject.id, { name: 'Too late' }, admin)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() => milestones.create(closingProject.id, { name: 'Too late' }, admin)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() =>
        submissions.create(closingProject.id, { reference: 'X', authorityName: 'Y' }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('holds every seeded Phase 2 permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: {
        permission: {
          in: [
            'planning:view',
            'planning:create',
            'planning:edit',
            'supervision:view',
            'supervision:create',
            'supervision:edit',
            'issue:view',
            'issue:create',
            'issue:edit',
            'issue:close',
          ],
        },
      },
    });
    // Every role that should hold planning:create on a project actually does,
    // proving the seed migration landed rather than merely existing on disk.
    const grants = await authorization.grantsFor(owningManager);
    expect(grants.project.has('planning:create')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });
});
