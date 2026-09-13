import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { HandoverService } from '../../src/modules/handover';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { InstructionService } from '../../src/modules/supervision/instruction.service';
import { ObservationService } from '../../src/modules/supervision/observation.service';
import { SiteVisitService } from '../../src/modules/supervision/site-visit.service';
import { SupervisionAgreementService } from '../../src/modules/supervision/supervision-agreement.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Supervision — site visits, observations and instructions.
 *
 * Same critical case as planning: a user who is not a member of the project
 * gets nothing. What is specific to this module is the second layer of
 * nesting — observations and instructions are reached through a site visit,
 * not the project directly — and that none of the three carries a status.
 */
describe('supervision', () => {
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
  const siteVisits = new SiteVisitService(prisma, audit);
  const observations = new ObservationService(prisma, audit);
  const instructions = new InstructionService(prisma, audit);
  const agreements = new SupervisionAgreementService(prisma, audit);

  const requestId = '44444444-2222-4111-8000-999999999999';
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
        email: `supervision-${crypto.randomUUID()}@example.com`,
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
  let clientId: string;
  let propertyId: string;
  let projectId: string;
  let siteVisitId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningSupervisor = await userWithRole('SUPERVISION');
    otherSupervisor = await userWithRole('SUPERVISION');

    const client = await inContext(() =>
      clients.create({ name: `Supervision Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Supervision House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Supervision Test Project',
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // The critical test
  // ---------------------------------------------------------------------------

  it('gives a non-member nothing at all for supervision on this project', async () => {
    expect(await authorization.can(otherSupervisor, 'supervision:view', projectId)).toBe(false);
    expect(await authorization.can(otherSupervisor, 'supervision:create', projectId)).toBe(false);
  });

  it('lets the project member see and create supervision records', async () => {
    expect(await authorization.can(owningSupervisor, 'supervision:view', projectId)).toBe(true);
    expect(await authorization.can(owningSupervisor, 'supervision:create', projectId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Site visits
  // ---------------------------------------------------------------------------

  it('creates, lists and edits a site visit', async () => {
    const visit = await inContext(() =>
      siteVisits.create(
        projectId,
        { visitDate: new Date('2026-06-02'), attendees: 'A, B' },
        owningSupervisor,
      ),
    );
    expect(visit.attendees).toBe('A, B');

    const page = await siteVisits.list(projectId, { page: 1, pageSize: 25 });
    expect(page.items.map((v) => v.id)).toContain(visit.id);

    const updated = await inContext(() =>
      siteVisits.update(projectId, visit.id, { notes: 'All quiet', version: 1 }, owningSupervisor),
    );
    expect(updated.notes).toBe('All quiet');
  });

  it('refuses a stale edit to a site visit', async () => {
    const visit = await inContext(() =>
      siteVisits.create(projectId, { visitDate: new Date('2026-06-03') }, owningSupervisor),
    );
    await inContext(() =>
      siteVisits.update(projectId, visit.id, { notes: 'First', version: 1 }, owningSupervisor),
    );

    await expect(
      inContext(() =>
        siteVisits.update(projectId, visit.id, { notes: 'Second', version: 1 }, owningSupervisor),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('refuses a site visit reached through the wrong project in the URL', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Other Supervision House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Supervision Project',
          type: 'SUPERVISION',
        },
        owningSupervisor,
      ),
    );

    await expect(siteVisits.byId(otherProject.id, siteVisitId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // Observations
  // ---------------------------------------------------------------------------

  it('creates and lists an observation on a site visit', async () => {
    const observation = await inContext(() =>
      observations.create(
        projectId,
        siteVisitId,
        { description: 'Crack in the north wall', category: 'Structural' },
        owningSupervisor,
      ),
    );

    const page = await observations.list(projectId, siteVisitId, { page: 1, pageSize: 25 });
    expect(page.items.map((o) => o.id)).toContain(observation.id);
  });

  it('refuses an observation reached through a site visit from the wrong project', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Yet Another House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Yet Another Project',
          type: 'SUPERVISION',
        },
        owningSupervisor,
      ),
    );

    await expect(
      inContext(() =>
        observations.create(
          otherProject.id,
          siteVisitId,
          { description: 'Should not land' },
          owningSupervisor,
        ),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------------
  // Instructions
  // ---------------------------------------------------------------------------

  it('creates an instruction and records it actioned by setting actionedAt', async () => {
    const instruction = await inContext(() =>
      instructions.create(
        projectId,
        siteVisitId,
        { directiveText: 'Prop the beam before next visit' },
        owningSupervisor,
      ),
    );
    expect(instruction.actionedAt).toBeNull();

    const actioned = await inContext(() =>
      instructions.update(
        projectId,
        siteVisitId,
        instruction.id,
        { actionedAt: new Date(), version: 1 },
        owningSupervisor,
      ),
    );
    expect(actioned.actionedAt).not.toBeNull();
  });

  it('audits the creation of an instruction', async () => {
    const instruction = await inContext(() =>
      instructions.create(
        projectId,
        siteVisitId,
        { directiveText: 'Isolate the supply' },
        owningSupervisor,
      ),
    );

    const entries = await prisma.auditEntry.count({
      where: { entityId: instruction.id, entityType: 'Instruction', action: 'CREATED' },
    });
    expect(entries).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Supervision agreements (docs/phase-7-plan.md)
  // ---------------------------------------------------------------------------

  it('computes visitsUsed for a MONTHLY agreement from the current calendar month only', async () => {
    const now = new Date();
    const agreement = await inContext(() =>
      agreements.create(
        projectId,
        { type: 'MONTHLY', visitsAllowed: 4, amount: 500, startDate: new Date('2026-01-01') },
        owningSupervisor,
      ),
    );
    // The beforeAll site visit is dated 2026-06-01 — outside the current
    // month unless this suite happens to run in June, so it must not count.
    expect(agreement.visitsUsed).toBe(0);

    await inContext(() => siteVisits.create(projectId, { visitDate: now }, owningSupervisor));

    const after = await agreements.byId(projectId, agreement.id);
    expect(after.visitsUsed).toBe(1);
  });

  it('computes visitsUsed for an ON_CALL agreement across its whole period', async () => {
    const agreement = await inContext(() =>
      agreements.create(
        projectId,
        {
          type: 'ON_CALL',
          visitsAllowed: 10,
          amount: 5000,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
        owningSupervisor,
      ),
    );
    // Covers the beforeAll visit (2026-06-01) and every visit created above.
    expect(agreement.visitsUsed).toBeGreaterThanOrEqual(1);
  });

  it('finds the active agreement without the caller naming an id', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Current Agreement House' }, admin),
    );
    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Current Agreement Project',
          type: 'SUPERVISION',
        },
        admin,
      ),
    );

    expect(await agreements.current(project.id)).toBeNull();

    const agreement = await inContext(() =>
      agreements.create(
        project.id,
        { type: 'ON_CALL', visitsAllowed: 6, amount: 3000, startDate: new Date('2026-01-01') },
        admin,
      ),
    );

    const current = await agreements.current(project.id);
    expect(current?.id).toBe(agreement.id);
  });

  it('renews an agreement, linking both directions, and refuses a second renewal', async () => {
    const agreement = await inContext(() =>
      agreements.create(
        projectId,
        {
          type: 'ON_CALL',
          visitsAllowed: 8,
          amount: 4000,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-06-30'),
        },
        owningSupervisor,
      ),
    );

    const renewal = await inContext(() =>
      agreements.renew(projectId, agreement.id, { version: agreement.version }, owningSupervisor),
    );
    expect(renewal.renewedFromId).toBe(agreement.id);
    expect(renewal.startDate.toISOString().slice(0, 10)).toBe('2026-07-01');

    const source = await agreements.byId(projectId, agreement.id);
    expect(source.renewedAt).not.toBeNull();

    await expect(
      inContext(() =>
        agreements.renew(projectId, agreement.id, { version: source.version }, owningSupervisor),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses an agreement reached through the wrong project in the URL', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Other Agreement House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Agreement Project',
          type: 'SUPERVISION',
        },
        admin,
      ),
    );

    const agreement = await inContext(() =>
      agreements.create(
        projectId,
        { type: 'MONTHLY', visitsAllowed: 2, amount: 200, startDate: new Date('2026-01-01') },
        owningSupervisor,
      ),
    );

    await expect(agreements.byId(otherProject.id, agreement.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // ---------------------------------------------------------------------------
  // A closed project accepts no new supervision work
  // ---------------------------------------------------------------------------

  it('refuses to create supervision records on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing Supervision House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Supervision Project',
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
    await completeHandover(closingProject.id);
    await inContext(() =>
      projects.transition(closingProject.id, 'close', { version: current.version }, admin),
    );

    await expect(
      inContext(() => siteVisits.create(closingProject.id, { visitDate: new Date() }, admin)),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await expect(
      inContext(() =>
        agreements.create(
          closingProject.id,
          { type: 'ON_CALL', visitsAllowed: 1, amount: 100, startDate: new Date() },
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
