import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { HandoverService } from '../../src/modules/handover';
import { CompletionGateService } from '../../src/modules/projects/completion-gate.service';
import { MembershipService } from '../../src/modules/projects/membership.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { ProjectController } from '../../src/modules/projects/projects.controller';
import { WorkstreamService } from '../../src/modules/projects/workstream.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { finishWorkstreams } from '../fixtures/workstreams';

/**
 * Completion gates — a project or workstream may only be marked Completed
 * once its own work is finished:
 *
 *  - Planning:    no submission in progress, every milestone reached, every
 *                 activity done.
 *  - Supervision: no open supervision issue, no drawing revision or
 *                 modification awaiting a decision.
 *  - Project:     every workstream Completed.
 *
 * Each gate is refused with PRECONDITIONS_UNMET naming every unmet check,
 * passes once they clear, and can be pushed past only with a written reason
 * by a holder of `workflow:override_gate` — which the audit trail records.
 */
describe('completion gates', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const gates = new CompletionGateService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(
    prisma,
    audit,
    authorization,
    new SequenceService(),
    new HandoverService(prisma, audit),
    gates,
  );
  const workstreams = new WorkstreamService(prisma, audit, gates);

  const requestId = '88888888-3333-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        username: `gates-${crypto.randomUUID()}`,
        email: `gates-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let clientId: string;
  let propertyId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    const client = await inContext(() =>
      clients.create({ name: `Gates Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Gates House' }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A fresh, active project of the given type. */
  async function activeProject(
    type: 'PLANNING' | 'SUPERVISION' | 'BOTH',
  ): Promise<{ id: string; version: number }> {
    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `GTE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Gates Test Project',
          type,
        },
        admin,
      ),
    );
    const active = await inContext(() =>
      projects.transition(project.id, 'activate', { version: 1 }, admin),
    );
    return { id: project.id, version: active.version };
  }

  async function workstreamOf(projectId: string, type: 'PLANNING' | 'SUPERVISION') {
    return prisma.workstream.findFirstOrThrow({ where: { projectId, type } });
  }

  /** Starts the workstream so that COMPLETED is a legal next move. */
  async function startedWorkstream(projectId: string, type: 'PLANNING' | 'SUPERVISION') {
    const ws = await workstreamOf(projectId, type);
    return inContext(() =>
      workstreams.transition(projectId, ws.id, { to: 'IN_PROGRESS', version: ws.version }),
    );
  }

  function complete(projectId: string, ws: { id: string; version: number }, reason?: string) {
    return inContext(() =>
      workstreams.transition(projectId, ws.id, {
        to: 'COMPLETED',
        version: ws.version,
        ...(reason ? { override: { reason } } : {}),
      }),
    );
  }

  describe('planning workstream', () => {
    it('is refused while a submission, milestone or activity is outstanding — naming each', async () => {
      const { id } = await activeProject('PLANNING');
      await prisma.submission.create({
        data: { projectId: id, reference: 'SUB-1', authorityName: 'Muscat Municipality' },
      });
      await prisma.milestone.create({ data: { projectId: id, name: 'Concept approval' } });
      await prisma.planningActivity.create({ data: { projectId: id, name: 'Site survey' } });
      const ws = await startedWorkstream(id, 'PLANNING');

      const refusal = await complete(id, ws).catch((error: unknown) => error);
      expect(refusal).toMatchObject({ code: 'PRECONDITIONS_UNMET' });
      expect((refusal as { fields: { field: string }[] }).fields.map((f) => f.field)).toEqual([
        'submissions',
        'milestones',
        'activities',
      ]);
      expect((await workstreamOf(id, 'PLANNING')).status).toBe('IN_PROGRESS');
      expect(
        await prisma.auditEntry.count({
          where: { entityId: ws.id, action: 'STATUS_CHANGED', outcome: 'REJECTED' },
        }),
      ).toBe(1);
    });

    it('passes once every submission is decided, milestone reached and activity done', async () => {
      const { id } = await activeProject('PLANNING');
      await prisma.submission.create({
        data: { projectId: id, reference: 'SUB-2', authorityName: 'Authority', status: 'APPROVED' },
      });
      await prisma.submission.create({
        data: {
          projectId: id,
          reference: 'SUB-3',
          authorityName: 'Authority',
          status: 'WITHDRAWN',
        },
      });
      await prisma.milestone.create({
        data: { projectId: id, name: 'Reached', achievedDate: new Date() },
      });
      // Archived records are no longer part of the work.
      await prisma.milestone.create({
        data: { projectId: id, name: 'Dropped', archivedAt: new Date() },
      });
      await prisma.planningActivity.create({ data: { projectId: id, name: 'Done', done: true } });
      const ws = await startedWorkstream(id, 'PLANNING');

      const done = await complete(id, ws);
      expect(done.status).toBe('COMPLETED');
    });
  });

  describe('supervision workstream', () => {
    it('is refused while an issue is open or a drawing or modification awaits a decision', async () => {
      const { id } = await activeProject('SUPERVISION');
      await prisma.issue.create({ data: { projectId: id, title: 'Crack in slab' } });
      const drawing = await prisma.drawing.create({
        data: { projectId: id, number: 'A-101', title: 'Ground floor plan' },
      });
      await prisma.drawingRevision.create({
        data: { drawingId: drawing.id, revisionCode: 'B', status: 'SUBMITTED' },
      });
      await prisma.modification.create({
        data: {
          projectId: id,
          requestText: 'Move kitchen wall',
          impactArea: 'ARCHITECTURE',
          status: 'UNDER_REVIEW',
        },
      });
      const ws = await startedWorkstream(id, 'SUPERVISION');

      const refusal = await complete(id, ws).catch((error: unknown) => error);
      expect(refusal).toMatchObject({ code: 'PRECONDITIONS_UNMET' });
      expect((refusal as { fields: { field: string }[] }).fields.map((f) => f.field)).toEqual([
        'issues',
        'drawings',
        'modifications',
      ]);
    });

    it('on a BOTH project, counts only issues tagged to supervision', async () => {
      const { id } = await activeProject('BOTH');
      await prisma.issue.create({
        data: { projectId: id, title: 'Planning query', workstreamType: 'PLANNING' },
      });
      await prisma.issue.create({
        data: {
          projectId: id,
          title: 'Closed snag',
          workstreamType: 'SUPERVISION',
          status: 'CLOSED',
        },
      });
      const ws = await startedWorkstream(id, 'SUPERVISION');

      const done = await complete(id, ws);
      expect(done.status).toBe('COMPLETED');
    });
  });

  describe('project', () => {
    it('cannot be completed while a workstream is still open', async () => {
      const project = await activeProject('BOTH');

      const refusal = await inContext(() =>
        projects.transition(project.id, 'complete', { version: project.version }, admin),
      ).catch((error: unknown) => error);
      expect(refusal).toMatchObject({ code: 'PRECONDITIONS_UNMET' });
      expect((refusal as { fields: { field: string }[] }).fields).toEqual([
        expect.objectContaining({ field: 'workstreams' }),
      ]);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(
        'ACTIVE',
      );
    });

    it('completes once every workstream is finished', async () => {
      const project = await activeProject('BOTH');
      await finishWorkstreams(prisma, project.id);

      const done = await inContext(() =>
        projects.transition(project.id, 'complete', { version: project.version }, admin),
      );
      expect(done.status).toBe('COMPLETED');
    });
  });

  describe('override', () => {
    it('lets an unmet gate through with a reason, and records both in the audit trail', async () => {
      const project = await activeProject('PLANNING');

      const done = await inContext(() =>
        projects.transition(
          project.id,
          'complete',
          { version: project.version, override: { reason: 'Client terminated the engagement' } },
          admin,
        ),
      );
      expect(done.status).toBe('COMPLETED');

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { entityId: project.id, action: 'STATUS_CHANGED', outcome: 'SUCCEEDED' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(entry.after).toMatchObject({
        status: 'COMPLETED',
        gateOverride: {
          reason: 'Client terminated the engagement',
          unmet: ['Every workstream completed'],
        },
      });
    });

    it('records no override when the gate was already met', async () => {
      const project = await activeProject('PLANNING');
      await finishWorkstreams(prisma, project.id);

      await inContext(() =>
        projects.transition(
          project.id,
          'complete',
          { version: project.version, override: { reason: 'Not actually needed' } },
          admin,
        ),
      );
      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { entityId: project.id, action: 'STATUS_CHANGED', outcome: 'SUCCEEDED' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(entry.after).not.toHaveProperty('gateOverride');
    });

    it('is held by Director and System Administrator only', async () => {
      const director = await userWithRole('DIRECTOR');
      const planner = await userWithRole('PLANNING');
      expect(await authorization.can(admin, 'workflow:override_gate')).toBe(true);
      expect(await authorization.can(director, 'workflow:override_gate')).toBe(true);
      expect(await authorization.can(planner, 'workflow:override_gate')).toBe(false);
    });
  });

  describe('who may complete', () => {
    // The controller is where "edit, or override" is decided, so it is driven
    // directly here — the route guard only asks for `project:view`.
    const controller = new ProjectController(
      projects,
      new MembershipService(prisma, audit),
      workstreams,
      gates,
      authorization,
    );
    const as = (userId: string) => ({ currentUser: { id: userId } }) as never;

    it('lets a Director, who cannot edit projects, complete only by overriding', async () => {
      const director = await userWithRole('DIRECTOR');
      const project = await activeProject('PLANNING');

      await expect(
        inContext(() =>
          controller.complete(project.id, { version: project.version }, as(director)),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const done = await inContext(() =>
        controller.complete(
          project.id,
          { version: project.version, override: { reason: 'Signed off by the client' } },
          as(director),
        ),
      );
      expect(done.status).toBe('COMPLETED');
    });

    it('refuses an override from someone without the override permission', async () => {
      const manager = await userWithRole('PROJECT_MANAGER');
      const project = await activeProject('PLANNING');

      await expect(
        inContext(() =>
          controller.complete(
            project.id,
            { version: project.version, override: { reason: 'Trying my luck here' } },
            as(manager),
          ),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('never lets an override drive a workstream anywhere but Completed', async () => {
      const director = await userWithRole('DIRECTOR');
      const { id } = await activeProject('PLANNING');
      const ws = await workstreamOf(id, 'PLANNING');

      await expect(
        inContext(() =>
          controller.transitionWorkstream(
            id,
            ws.id,
            { to: 'IN_PROGRESS', version: ws.version, override: { reason: 'Not a completion' } },
            as(director),
          ),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('readiness', () => {
    it('reports the same checks the transitions enforce', async () => {
      const { id } = await activeProject('BOTH');
      await prisma.milestone.create({ data: { projectId: id, name: 'Outstanding' } });

      const result = await gates.readiness(id);
      expect(result.project.ready).toBe(false);
      const planning = result.workstreams.find((w) => w.type === 'PLANNING');
      const supervision = result.workstreams.find((w) => w.type === 'SUPERVISION');
      expect(planning?.readiness.ready).toBe(false);
      expect(planning?.readiness.checks.find((c) => c.key === 'milestones')).toMatchObject({
        met: false,
        detail: '1 milestone not yet reached.',
      });
      expect(supervision?.readiness.ready).toBe(true);
    });
  });

  it('refuses any workstream change on a closed project', async () => {
    const { id } = await activeProject('SUPERVISION');
    const ws = await workstreamOf(id, 'SUPERVISION');
    await prisma.project.update({ where: { id }, data: { status: 'CLOSED' } });

    await expect(
      inContext(() =>
        workstreams.transition(id, ws.id, { to: 'IN_PROGRESS', version: ws.version }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
