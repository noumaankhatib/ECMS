import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DrawingRevisionService } from '../../src/modules/drawings/drawing-revision.service';
import { DrawingService } from '../../src/modules/drawings/drawing.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Drawings — the strictest invariant in the system
 * (docs/phase-3-plan.md §5). Same critical case as every other module: a
 * non-member gets nothing. What is specific here is append-only revision
 * history and the database trigger that makes an approved revision
 * immutable even against a direct Prisma call that never goes through the
 * service layer at all.
 */
describe('drawings', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(prisma, audit, authorization, new SequenceService());
  const drawings = new DrawingService(prisma, audit);
  const revisions = new DrawingRevisionService(prisma, audit);

  const requestId = '66666666-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `drawing-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let owningPlanner: string;
  let otherPlanner: string;
  let director: string;
  let clientId: string;
  let propertyId: string;
  let projectId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningPlanner = await userWithRole('PLANNING');
    otherPlanner = await userWithRole('PLANNING');
    director = await userWithRole('DIRECTOR');

    const client = await inContext(() =>
      clients.create({ name: `Drawing Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Drawing House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `DRW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Drawing Test Project',
          type: 'PLANNING',
        },
        owningPlanner,
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

  it('gives a non-member nothing at all for drawings on this project', async () => {
    expect(await authorization.can(otherPlanner, 'drawing:view', projectId)).toBe(false);
    expect(await authorization.can(otherPlanner, 'drawing:create', projectId)).toBe(false);
  });

  it('lets the project member see and create drawings, but not approve', async () => {
    expect(await authorization.can(owningPlanner, 'drawing:view', projectId)).toBe(true);
    expect(await authorization.can(owningPlanner, 'drawing:create', projectId)).toBe(true);
    // Approval is Director's and System Administrator's, per PRD §3 —
    // Planning Team's own description says "drawings", not "approvals" for
    // drawings specifically (unlike planning:approve in step 13).
    expect(await authorization.can(owningPlanner, 'drawing:approve', projectId)).toBe(false);
  });

  it('gives the Director view and approve, globally, but no create', async () => {
    expect(await authorization.can(director, 'drawing:view')).toBe(true);
    expect(await authorization.can(director, 'drawing:approve')).toBe(true);
    expect(await authorization.can(director, 'drawing:create', projectId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Drawings and their first revision
  // ---------------------------------------------------------------------------

  it('creates a drawing with no current revision', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-101', title: 'Ground floor plan' }, owningPlanner),
    );
    expect(drawing.currentRevisionId).toBeNull();
  });

  it('refuses a duplicate drawing number on the same project, case-insensitively', async () => {
    await inContext(() =>
      drawings.create(projectId, { number: 'A-200', title: 'First floor plan' }, owningPlanner),
    );

    await expect(
      inContext(() =>
        drawings.create(projectId, { number: 'a-200', title: 'Duplicate' }, owningPlanner),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates a first revision, making it current', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-300', title: 'Roof plan' }, owningPlanner),
    );

    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );
    expect(revision.status).toBe('DRAFT');
    expect(revision.supersededAt).toBeNull();

    const after = await drawings.byId(projectId, drawing.id);
    expect(after.currentRevisionId).toBe(revision.id);
  });

  it('refuses a duplicate revision code on the same drawing', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-301', title: 'Roof plan, take two' }, owningPlanner),
    );
    await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );

    await expect(
      inContext(() =>
        revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // ---------------------------------------------------------------------------
  // A second revision supersedes the first
  // ---------------------------------------------------------------------------

  it('supersedes the previous current revision when a new one arrives', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-400', title: 'Section A-A' }, owningPlanner),
    );
    const first = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );

    const second = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P2' }, owningPlanner),
    );

    const supersededFirst = await revisions.byId(projectId, drawing.id, first.id);
    expect(supersededFirst.supersededAt).not.toBeNull();

    const stillCurrentSecond = await revisions.byId(projectId, drawing.id, second.id);
    expect(stillCurrentSecond.supersededAt).toBeNull();

    const drawingAfter = await drawings.byId(projectId, drawing.id);
    expect(drawingAfter.currentRevisionId).toBe(second.id);
  });

  // ---------------------------------------------------------------------------
  // The approval walk, and the database trigger once approved
  // ---------------------------------------------------------------------------

  it('walks a revision to Approved, then the database refuses to change it — even bypassing the service entirely', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-500', title: 'Foundation plan' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'C1' }, owningPlanner),
    );

    let current = await inContext(() =>
      revisions.transition(projectId, drawing.id, revision.id, 'submit', { version: 1 }),
    );
    current = await inContext(() =>
      revisions.transition(projectId, drawing.id, revision.id, 'review', {
        version: current.version,
      }),
    );
    current = await inContext(() =>
      revisions.transition(projectId, drawing.id, revision.id, 'approve', {
        version: current.version,
      }),
    );
    expect(current.status).toBe('APPROVED');

    // Not through the service. Direct Prisma, the same client the whole API
    // is built on — proving the rule holds even against a bug that skipped
    // every layer of application code.
    await expect(
      prisma.drawingRevision.update({
        where: { id: revision.id },
        data: { notes: 'tampering with history' },
      }),
    ).rejects.toThrow(/immutable/i);

    await expect(prisma.drawingRevision.delete({ where: { id: revision.id } })).rejects.toThrow(
      /cannot be deleted/i,
    );

    // The one write the trigger does allow: a later revision superseding it.
    await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'C2' }, owningPlanner),
    );
    const afterSuperseded = await revisions.byId(projectId, drawing.id, revision.id);
    expect(afterSuperseded.supersededAt).not.toBeNull();
    expect(afterSuperseded.status).toBe('APPROVED');
  });

  it('refuses to skip straight from Draft to Approved', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-501', title: 'Drainage plan' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );

    await expect(
      inContext(() =>
        revisions.transition(projectId, drawing.id, revision.id, 'approve', { version: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('records the refused transition, not only the ones that happened', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-502', title: 'Elevation' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );

    await expect(
      inContext(() =>
        revisions.transition(projectId, drawing.id, revision.id, 'approve', { version: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const rejected = await prisma.auditEntry.count({
      where: {
        entityId: revision.id,
        entityType: 'DrawingRevision',
        action: 'STATUS_CHANGED',
        outcome: 'REJECTED',
      },
    });
    expect(rejected).toBe(1);
  });

  it('refuses a transition made from a stale version', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-503', title: 'Details' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );
    await inContext(() =>
      revisions.transition(projectId, drawing.id, revision.id, 'submit', { version: 1 }),
    );

    // The second caller read version 1 before 'submit' landed. 'review' is
    // still legal from the fresh state, SUBMITTED, so this is genuinely a
    // version conflict, not the illegal-transition case a second 'submit'
    // attempt would hit instead.
    await expect(
      inContext(() =>
        revisions.transition(projectId, drawing.id, revision.id, 'review', { version: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  // ---------------------------------------------------------------------------
  // Reached through the wrong project or drawing
  // ---------------------------------------------------------------------------

  it('refuses a drawing reached through the wrong project in the URL', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Other Drawing House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `DRW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Drawing Project',
          type: 'PLANNING',
        },
        owningPlanner,
      ),
    );

    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-600', title: 'Belongs elsewhere' }, owningPlanner),
    );

    await expect(drawings.byId(otherProject.id, drawing.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses a revision reached through a drawing that is not this one', async () => {
    const drawingA = await inContext(() =>
      drawings.create(projectId, { number: 'A-601', title: 'Drawing A' }, owningPlanner),
    );
    const drawingB = await inContext(() =>
      drawings.create(projectId, { number: 'A-602', title: 'Drawing B' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawingA.id, { revisionCode: 'P1' }, owningPlanner),
    );

    await expect(revisions.byId(projectId, drawingB.id, revision.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // A closed project accepts no new drawing work
  // ---------------------------------------------------------------------------

  it('refuses to create a drawing, or a revision, on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing Drawing House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `DRW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Drawing Project',
          type: 'PLANNING',
        },
        admin,
      ),
    );

    const drawing = await inContext(() =>
      drawings.create(closingProject.id, { number: 'A-900', title: 'Last one' }, admin),
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
        drawings.create(closingProject.id, { number: 'A-901', title: 'Too late' }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() =>
        revisions.create(closingProject.id, drawing.id, { revisionCode: 'P1' }, admin),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('holds every seeded drawing permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { in: ['drawing:view', 'drawing:create', 'drawing:approve'] } },
    });
    const grants = await authorization.grantsFor(owningPlanner);
    expect(grants.project.has('drawing:create')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });
});
