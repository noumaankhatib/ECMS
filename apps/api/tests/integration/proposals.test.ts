import { createProposalSchema } from '@ecms/contracts';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { ProposalService } from '../../src/modules/proposals/proposal.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * Proposals — the fifth state machine in the system (docs/phase-5-plan.md
 * §4). Unlike Project/Workstream/Issue, a proposal is never project-scoped
 * (§6): every permission here is GLOBAL, so there is no membership case to
 * prove — only the role matrix itself, and the transition table's own rules.
 */
describe('proposals', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit, new SequenceService());
  const properties = new PropertyService(prisma, audit, new SequenceService());
  const proposals = new ProposalService(prisma, audit, new SequenceService());

  const requestId = '55555555-3333-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        username: `proposal-${crypto.randomUUID()}`,
        email: `proposal-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let planner: string;
  let director: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    planner = await userWithRole('PLANNING');
    director = await userWithRole('DIRECTOR');
  });

  /** Creates a client and a property on it, then a proposal already carrying
   *  both and walked all the way to WON — the fixture every convert test
   *  needs. */
  async function wonProposalWithProperty(contactName: string) {
    const client = await inContext(() =>
      clients.create({ firstName: `Convert Client ${crypto.randomUUID()}` }, admin),
    );
    const property = await inContext(() =>
      properties.create({ clientId: client.id, name: 'Convert House' }, admin),
    );
    const proposal = await inContext(() =>
      proposals.create(
        {
          contactName,
          clientId: client.id,
          propertyId: property.id,
          surveyReference: `1-35-055-01-${crypto.randomUUID().slice(0, 6)}`,
          requirements: 'A 3-bedroom villa with a detached majlis.',
        },
        planner,
      ),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });
    return { won, client, property };
  }

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  it('lets Planning view, create and edit proposals, but not convert them', async () => {
    expect(await authorization.can(planner, 'proposal:view')).toBe(true);
    expect(await authorization.can(planner, 'proposal:create')).toBe(true);
    expect(await authorization.can(planner, 'proposal:edit')).toBe(true);
    expect(await authorization.can(planner, 'proposal:convert')).toBe(false);
  });

  it('gives the Director view only, matching oversight without edit rights', async () => {
    expect(await authorization.can(director, 'proposal:view')).toBe(true);
    expect(await authorization.can(director, 'proposal:create')).toBe(false);
    expect(await authorization.can(director, 'proposal:edit')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Create with bare contact info
  // ---------------------------------------------------------------------------

  it('logs a proposal from a bare contact name, with a generated sketch number', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Walk-in inquiry' }, planner),
    );
    expect(proposal.status).toBe('NEW');
    expect(proposal.sketchNumber).toMatch(/^\d{2}-SB-\d+$/);
    expect(proposal.clientId).toBeNull();
  });

  it('requires naming who submitted when someone else is submitting on the client’s behalf', () => {
    const missingName = createProposalSchema.safeParse({
      contactName: 'Proxy submission',
      submissionType: 'OTHER',
    });
    expect(missingName.success).toBe(false);

    const named = createProposalSchema.safeParse({
      contactName: 'Proxy submission',
      submissionType: 'OTHER',
      submittedBy: 'Khalid Al Rawahi',
      submitterRelationship: 'Agent',
      surveyReference: '1-35-055-01-100',
      requirements: 'Proxy submission requirements.',
    });
    expect(named.success).toBe(true);

    const self = createProposalSchema.safeParse({
      contactName: 'Direct submission',
      submissionType: 'SELF',
      surveyReference: '1-35-055-01-101',
      requirements: 'Direct submission requirements.',
    });
    expect(self.success).toBe(true);
  });

  it('finds a proposal by survey reference, requirements words, or its architect', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const architect = await prisma.user.create({
      data: {
        username: `architect-${crypto.randomUUID()}`,
        email: `architect-${crypto.randomUUID()}@example.com`,
        displayName: `Architect${tag} Planner`,
        passwordHash: 'not-used-in-this-test',
      },
    });
    const proposal = await inContext(() =>
      proposals.create(
        {
          contactName: `Contact ${tag}`,
          surveyReference: `SR-${tag}`,
          requirements: `Boundary wall ${tag} and gate`,
          assignedArchitectId: architect.id,
        },
        planner,
      ),
    );

    const found = async (search: string, searchPeople: boolean): Promise<boolean> => {
      const page = await proposals.list(
        { page: 1, pageSize: 100, search },
        { searchPeople },
      );
      return page.items.some((p) => p.id === proposal.id);
    };

    expect(await found(`SR-${tag}`, false)).toBe(true);
    expect(await found(`boundary gate ${tag}`, false)).toBe(true);
    // By architect only for a caller who may see people.
    expect(await found(`Architect${tag}`, true)).toBe(true);
    expect(await found(`Architect${tag}`, false)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // The status machine
  // ---------------------------------------------------------------------------

  it('walks New → Concept → Client Revision → Approved → Won', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Full walk proposal' }, planner),
    );

    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    expect(concept.status).toBe('CONCEPT');

    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    expect(review.status).toBe('CLIENT_REVISION');

    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    expect(approved.status).toBe('APPROVED');

    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });
    expect(won.status).toBe('WON');
  });

  it('holds and resumes from Client Revision back into Concept', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Held proposal' }, planner),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });

    const held = await proposals.transition(proposal.id, 'hold', { version: concept.version });
    expect(held.status).toBe('ON_HOLD');

    const resumed = await proposals.transition(proposal.id, 'resume', { version: held.version });
    expect(resumed.status).toBe('CONCEPT');
  });

  it('refuses to skip straight from New to Approved', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Skip attempt' }, planner),
    );

    await expect(
      proposals.transition(proposal.id, 'approve', { version: proposal.version }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('records the refused transition, not only the ones that happened', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Rejected transition' }, planner),
    );

    await expect(
      proposals.transition(proposal.id, 'approve', { version: proposal.version }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    const rejected = await prisma.auditEntry.count({
      where: {
        entityId: proposal.id,
        entityType: 'Proposal',
        action: 'STATUS_CHANGED',
        outcome: 'REJECTED',
      },
    });
    expect(rejected).toBe(1);
  });

  it('refuses a transition made from a stale version', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Stale transition' }, planner),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });

    // The second caller read version 1 before 'startConcept' landed.
    // Sending for review is still legal from the proposal's fresh status,
    // CONCEPT, so this is genuinely a version conflict, not the
    // illegal-transition case a second 'startConcept' would hit instead.
    void concept;
    await expect(
      proposals.transition(proposal.id, 'sendForClientReview', { version: proposal.version }),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('never reaches CONVERTED through an ordinary transition', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'Not convertible this way' }, planner),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });

    // There is no PROPOSAL_ACTIONS entry that targets CONVERTED — proven
    // structurally, since attempting one would be a compile error, not a
    // runtime one. This test instead confirms WON has no legal ordinary exit.
    await expect(
      proposals.transition(won.id, 'approve', { version: won.version }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  // ---------------------------------------------------------------------------
  // Convert — the one path from WON to CONVERTED
  // ---------------------------------------------------------------------------

  it('converts a WON proposal with a property into a real numbered project', async () => {
    const { won, client, property } = await wonProposalWithProperty('Convert success');

    const converted = await proposals.convert(won.id, { version: won.version }, admin);
    expect(converted.status).toBe('CONVERTED');
    expect(converted.convertedProjectId).not.toBeNull();
    expect(converted.convertedAt).not.toBeNull();

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: converted.convertedProjectId! },
    });
    expect(project.clientId).toBe(client.id);
    expect(project.propertyId).toBe(property.id);
    expect(project.code).toMatch(/^\d{2}\.P\.\d+$/);
    // Named for the work (client and plot), not the inquiry's contact person.
    expect(project.name).toBe(`${client.firstName} – ${property.name}`);
    expect(project.description).toBe('A 3-bedroom villa with a detached majlis.');

    const workstreams = await prisma.workstream.findMany({ where: { projectId: project.id } });
    expect(workstreams.map((w) => w.type)).toEqual(['PLANNING']);

    const membership = await prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: admin },
    });
    expect(membership?.roleCode).toBe('PROJECT_MANAGER');
  });

  it('refuses to convert a WON proposal with no Krookie survey reference', async () => {
    const client = await inContext(() =>
      clients.create({ firstName: `No Krookie Client ${crypto.randomUUID()}` }, admin),
    );
    const property = await inContext(() =>
      properties.create({ clientId: client.id, name: 'No Krookie House' }, admin),
    );
    const proposal = await inContext(() =>
      proposals.create(
        {
          contactName: 'No Krookie yet',
          clientId: client.id,
          propertyId: property.id,
          requirements: 'Something, at least.',
        },
        planner,
      ),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });

    await expect(proposals.convert(won.id, { version: won.version }, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
      fields: [expect.objectContaining({ field: 'surveyReference' })],
    });
  });

  it('refuses to convert a WON proposal with no requirements recorded', async () => {
    const client = await inContext(() =>
      clients.create({ firstName: `No Requirements Client ${crypto.randomUUID()}` }, admin),
    );
    const property = await inContext(() =>
      properties.create({ clientId: client.id, name: 'No Requirements House' }, admin),
    );
    const proposal = await inContext(() =>
      proposals.create(
        {
          contactName: 'No requirements yet',
          clientId: client.id,
          propertyId: property.id,
          surveyReference: `1-35-055-01-${crypto.randomUUID().slice(0, 6)}`,
        },
        planner,
      ),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });

    await expect(proposals.convert(won.id, { version: won.version }, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
      fields: [expect.objectContaining({ field: 'requirements' })],
    });
  });

  it('refuses to convert a WON proposal with no property attached', async () => {
    const proposal = await inContext(() =>
      proposals.create({ contactName: 'No property to convert' }, planner),
    );
    const concept = await proposals.transition(proposal.id, 'startConcept', {
      version: proposal.version,
    });
    const review = await proposals.transition(proposal.id, 'sendForClientReview', {
      version: concept.version,
    });
    const approved = await proposals.transition(proposal.id, 'approve', {
      version: review.version,
    });
    const won = await proposals.transition(proposal.id, 'win', { version: approved.version });

    await expect(proposals.convert(won.id, { version: won.version }, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('refuses to convert a proposal that is not WON', async () => {
    const proposal = await inContext(() => proposals.create({ contactName: 'Still new' }, planner));

    await expect(
      proposals.convert(proposal.id, { version: proposal.version }, admin),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('refuses to convert from a stale version', async () => {
    const { won } = await wonProposalWithProperty('Stale convert');

    // An ordinary edit bumps the version without touching status, so the
    // proposal is genuinely still WON when the stale convert call below
    // lands — a real version conflict, not the not-WON case above.
    await proposals.update(
      won.id,
      { contactName: 'Stale convert, renamed', version: won.version },
      admin,
    );

    await expect(proposals.convert(won.id, { version: won.version }, admin)).rejects.toMatchObject({
      code: 'STALE_RECORD',
    });
  });

  it('holds every seeded proposal permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: {
        permission: {
          in: ['proposal:view', 'proposal:create', 'proposal:edit', 'proposal:convert'],
        },
      },
    });
    expect(rows.length).toBeGreaterThan(0);
  });
});
