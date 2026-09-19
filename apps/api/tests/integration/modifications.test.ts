import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DrawingRevisionService } from '../../src/modules/drawings/drawing-revision.service';
import { DrawingService } from '../../src/modules/drawings/drawing.service';
import { HandoverService } from '../../src/modules/handover';
import { ModificationService } from '../../src/modules/modifications/modification.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { ObservationService } from '../../src/modules/supervision/observation.service';
import { SiteVisitService } from '../../src/modules/supervision/site-visit.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Modifications — client-requested mid-construction changes
 * (docs/phase-8-plan.md). Status is `ApprovalStatus`, consumed directly like
 * `DrawingRevision`, and it may optionally link to a drawing revision and/or
 * an observation — both, one, or neither.
 */
describe('modifications', () => {
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
  const drawings = new DrawingService(prisma, audit);
  const drawingRevisions = new DrawingRevisionService(prisma, audit);
  const siteVisits = new SiteVisitService(prisma, audit);
  const observations = new ObservationService(prisma, audit);
  const modifications = new ModificationService(prisma, audit);

  const requestId = '55555555-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  // Closing is gated on a complete handover checklist
  // (docs/phase-10-plan.md §4): no open issues, no missing required
  // documents (the Phase 9 seed applies its six ANY-scoped categories to
  // every project), and every checklist item ticked.
  async function completeHandover(projectId: string): Promise<void> {
    const requirements = await prisma.requiredDocument.findMany({
      where: { archivedAt: null },
    });
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
        username: `modification-${crypto.randomUUID()}`,
        email: `modification-${crypto.randomUUID()}@example.com`,
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
  let clientId: string;
  let propertyId: string;
  let projectId: string;
  let drawingRevisionId: string;
  let observationId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningPlanner = await userWithRole('PLANNING');
    otherPlanner = await userWithRole('PLANNING');

    const client = await inContext(() =>
      clients.create({ name: `Modification Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Modification House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `MOD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Modification Test Project',
          type: 'BOTH',
        },
        owningPlanner,
      ),
    );
    projectId = project.id;

    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-101', title: 'Ground Floor Plan' }, owningPlanner),
    );
    const revision = await inContext(() =>
      drawingRevisions.create(projectId, drawing.id, { revisionCode: 'P1' }, owningPlanner),
    );
    drawingRevisionId = revision.id;

    const visit = await inContext(() =>
      siteVisits.create(projectId, { visitDate: new Date('2026-06-01') }, owningPlanner),
    );
    const observation = await inContext(() =>
      observations.create(
        projectId,
        visit.id,
        { description: 'Client asked for a wall move' },
        owningPlanner,
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

  it('gives a non-member nothing at all for modifications on this project', async () => {
    expect(await authorization.can(otherPlanner, 'planning:view', projectId)).toBe(false);
    expect(await authorization.can(otherPlanner, 'planning:create', projectId)).toBe(false);
  });

  it('lets the project member see and create modifications', async () => {
    expect(await authorization.can(owningPlanner, 'planning:view', projectId)).toBe(true);
    expect(await authorization.can(owningPlanner, 'planning:create', projectId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  it('creates a modification with no links at all', async () => {
    const modification = await inContext(() =>
      modifications.create(
        projectId,
        { requestText: 'Add a second bathroom', impactArea: 'ARCHITECTURE' },
        owningPlanner,
      ),
    );
    expect(modification.status).toBe('DRAFT');
    expect(modification.drawingRevisionId).toBeNull();
    expect(modification.observationId).toBeNull();
  });

  it('creates a modification linked to both a drawing revision and an observation', async () => {
    const modification = await inContext(() =>
      modifications.create(
        projectId,
        {
          requestText: 'Move the north wall per the client visit',
          impactArea: 'STRUCTURAL',
          costImpact: '+OMR 1,200',
          timeImpact: '+1 week',
          drawingRevisionId,
          observationId,
        },
        owningPlanner,
      ),
    );
    expect(modification.drawingRevisionId).toBe(drawingRevisionId);
    expect(modification.observationId).toBe(observationId);
  });

  it('refuses a drawing revision reached through the wrong project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Other Modification House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `MOD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Modification Project',
          type: 'BOTH',
        },
        admin,
      ),
    );

    await expect(
      inContext(() =>
        modifications.create(
          otherProject.id,
          { requestText: 'Should not land', impactArea: 'MEP', drawingRevisionId },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('edits the request text and impact area with optimistic locking', async () => {
    const modification = await inContext(() =>
      modifications.create(
        projectId,
        { requestText: 'Widen the corridor', impactArea: 'ARCHITECTURE' },
        owningPlanner,
      ),
    );

    const updated = await inContext(() =>
      modifications.update(
        projectId,
        modification.id,
        { costImpact: '+OMR 500', version: modification.version },
        owningPlanner,
      ),
    );
    expect(updated.costImpact).toBe('+OMR 500');

    await expect(
      inContext(() =>
        modifications.update(
          projectId,
          modification.id,
          { costImpact: '+OMR 999', version: modification.version },
          owningPlanner,
        ),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  // ---------------------------------------------------------------------------
  // Approval — the shared `ApprovalStatus` machine, consumed directly
  // ---------------------------------------------------------------------------

  it('moves a modification through submit, review and approve', async () => {
    const modification = await inContext(() =>
      modifications.create(
        projectId,
        { requestText: 'Add a skylight', impactArea: 'ARCHITECTURE' },
        owningPlanner,
      ),
    );

    let current = await inContext(() =>
      modifications.transition(projectId, modification.id, 'submit', {
        version: modification.version,
      }),
    );
    expect(current.status).toBe('SUBMITTED');

    current = await inContext(() =>
      modifications.transition(projectId, modification.id, 'review', { version: current.version }),
    );
    expect(current.status).toBe('UNDER_REVIEW');

    current = await inContext(() =>
      modifications.transition(projectId, modification.id, 'approve', {
        version: current.version,
      }),
    );
    expect(current.status).toBe('APPROVED');
  });

  it('refuses an illegal transition and audits the refusal', async () => {
    const modification = await inContext(() =>
      modifications.create(
        projectId,
        { requestText: 'Add a second staircase', impactArea: 'STRUCTURAL' },
        owningPlanner,
      ),
    );

    await expect(
      inContext(() =>
        modifications.transition(projectId, modification.id, 'approve', {
          version: modification.version,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const entries = await prisma.auditEntry.count({
      where: { entityId: modification.id, entityType: 'Modification', outcome: 'REJECTED' },
    });
    expect(entries).toBe(1);
  });

  it('refuses a modification reached through the wrong project in the URL', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Yet Another Modification House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `MOD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Yet Another Modification Project',
          type: 'BOTH',
        },
        admin,
      ),
    );

    const modification = await inContext(() =>
      modifications.create(
        projectId,
        { requestText: 'Should not be reachable from elsewhere', impactArea: 'MEP' },
        owningPlanner,
      ),
    );

    await expect(modifications.byId(otherProject.id, modification.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // A closed project accepts no new modifications
  // ---------------------------------------------------------------------------

  it('refuses to create a modification on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing Modification House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `MOD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Modification Project',
          type: 'BOTH',
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
    await completeHandover(closingProject.id);
    await inContext(() =>
      projects.transition(closingProject.id, 'close', { version: current.version }, admin),
    );

    await expect(
      inContext(() =>
        modifications.create(
          closingProject.id,
          { requestText: 'Too late', impactArea: 'ARCHITECTURE' },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
