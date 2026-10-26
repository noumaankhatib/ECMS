import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DrawingRevisionService } from '../../src/modules/drawings/drawing-revision.service';
import { DrawingService } from '../../src/modules/drawings/drawing.service';
import { HandoverService } from '../../src/modules/handover';
import { CompletionGateService } from '../../src/modules/projects/completion-gate.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { LocalDriveAdapter } from '../../src/shared/drive/local-drive-adapter';
import { finishWorkstreams } from '../fixtures/workstreams';

function fakeFile(content: string): {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
} {
  const buffer = Buffer.from(content, 'utf8');
  return { buffer, originalname: 'plan.pdf', mimetype: 'application/pdf', size: buffer.length };
}

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
  const clients = new ClientService(prisma, audit, new SequenceService());
  const properties = new PropertyService(prisma, audit, new SequenceService());
  const handover = new HandoverService(prisma, audit);
  const projects = new ProjectService(
    prisma,
    audit,
    authorization,
    new SequenceService(),
    handover,
    new CompletionGateService(prisma),
  );
  const drawings = new DrawingService(prisma, audit);
  const revisions = new DrawingRevisionService(prisma, audit, new LocalDriveAdapter());

  const requestId = '66666666-2222-4111-8000-999999999999';
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
        username: `drawing-${crypto.randomUUID()}`,
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
      clients.create({ firstName: `Drawing Client ${crypto.randomUUID()}` }, admin),
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
      revisions.create(
        projectId,
        drawing.id,
        { revisionCode: 'C1' },
        owningPlanner,
        fakeFile('%PDF-1.4 approved drawing bytes'),
      ),
    );

    let current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'submit',
        {
          version: revision.version,
        },
        owningPlanner,
      ),
    );
    current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'review',
        {
          version: current.version,
        },
        owningPlanner,
      ),
    );
    current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'approve',
        {
          version: current.version,
        },
        director,
      ),
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

  it('refuses to approve a revision that has no file, and approves it once it has one', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-590', title: 'Section A-A' }, owningPlanner),
    );
    const noFile = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'N1' }, owningPlanner),
    );
    let current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        noFile.id,
        'submit',
        { version: 1 },
        owningPlanner,
      ),
    );
    current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        noFile.id,
        'review',
        {
          version: current.version,
        },
        owningPlanner,
      ),
    );

    // Nothing to open, so nothing to approve — and the refusal says why.
    await expect(
      inContext(() =>
        revisions.transition(
          projectId,
          drawing.id,
          noFile.id,
          'approve',
          {
            version: current.version,
          },
          director,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      fields: [expect.objectContaining({ reason: expect.stringContaining('no drawing file') })],
    });
    expect((await revisions.byId(projectId, drawing.id, noFile.id)).status).toBe('UNDER_REVIEW');

    // The same walk with a file attached goes through.
    const withFile = await inContext(() =>
      revisions.create(
        projectId,
        drawing.id,
        { revisionCode: 'N2' },
        owningPlanner,
        fakeFile('%PDF-1.4 section bytes'),
      ),
    );
    let walk = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        withFile.id,
        'submit',
        {
          version: withFile.version,
        },
        owningPlanner,
      ),
    );
    walk = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        withFile.id,
        'review',
        {
          version: walk.version,
        },
        owningPlanner,
      ),
    );
    walk = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        withFile.id,
        'approve',
        {
          version: walk.version,
        },
        director,
      ),
    );
    expect(walk.status).toBe('APPROVED');
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
        revisions.transition(
          projectId,
          drawing.id,
          revision.id,
          'approve',
          { version: 1 },
          director,
        ),
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
        revisions.transition(
          projectId,
          drawing.id,
          revision.id,
          'approve',
          { version: 1 },
          director,
        ),
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
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'submit',
        { version: 1 },
        owningPlanner,
      ),
    );

    // The second caller read version 1 before 'submit' landed. 'review' is
    // still legal from the fresh state, SUBMITTED, so this is genuinely a
    // version conflict, not the illegal-transition case a second 'submit'
    // attempt would hit instead.
    await expect(
      inContext(() =>
        revisions.transition(
          projectId,
          drawing.id,
          revision.id,
          'review',
          { version: 1 },
          owningPlanner,
        ),
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
    await finishWorkstreams(prisma, closingProject.id);
    current = await inContext(() =>
      projects.transition(closingProject.id, 'complete', { version: current.version }, admin),
    );
    await completeHandover(closingProject.id);
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

  it('refuses to let the person who created a revision approve it', async () => {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number: 'A-591', title: 'Self-approval check' }, owningPlanner),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'S1' }, owningPlanner),
    );
    let current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'submit',
        { version: 1 },
        owningPlanner,
      ),
    );
    current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'review',
        { version: current.version },
        owningPlanner,
      ),
    );

    await expect(
      inContext(() =>
        revisions.transition(
          projectId,
          drawing.id,
          revision.id,
          'approve',
          { version: current.version },
          owningPlanner,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      fields: [expect.objectContaining({ reason: expect.stringContaining('created yourself') })],
    });
    expect((await revisions.byId(projectId, drawing.id, revision.id)).status).toBe('UNDER_REVIEW');

    // Rejecting or returning your own work is not the conflict approving it is.
    const returned = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'returnForRevision',
        { version: current.version },
        owningPlanner,
      ),
    );
    expect(returned.status).toBe('RETURNED_FOR_REVISION');
  });

  it('holds every seeded drawing permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: { in: ['drawing:view', 'drawing:create', 'drawing:approve'] } },
    });
    const grants = await authorization.grantsFor(owningPlanner);
    expect(grants.project.has('drawing:create')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  /** A revision made by `creator`, submitted and under review, ready to approve. */
  async function revisionUnderReview(creator: string, number: string) {
    const drawing = await inContext(() =>
      drawings.create(projectId, { number, title: 'Override check' }, creator),
    );
    const revision = await inContext(() =>
      revisions.create(projectId, drawing.id, { revisionCode: 'O1' }, creator),
    );
    let current = await inContext(() =>
      revisions.transition(projectId, drawing.id, revision.id, 'submit', { version: 1 }, creator),
    );
    current = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'review',
        { version: current.version },
        creator,
      ),
    );
    // Approval needs the file to be on record.
    await prisma.drawingRevision.update({
      where: { id: revision.id },
      data: { fileId: `file-${revision.id}`, uploadStatus: 'ACTIVE' },
    });
    return { drawing, revision, version: current.version };
  }

  async function approvalAudit(revisionId: string) {
    const rows = await prisma.auditEntry.findMany({
      where: { entityId: revisionId, action: 'STATUS_CHANGED', outcome: 'SUCCEEDED' },
      orderBy: { occurredAt: 'desc' },
    });
    return rows[0]?.after as { status?: string; selfApprovalOverride?: { reason: string } } | null;
  }

  it('lets a System Administrator approve their own revision with a written reason, and audits it', async () => {
    const { drawing, revision, version } = await revisionUnderReview(admin, 'A-701');
    const approved = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'approve',
        { version, override: { reason: 'The only approver is away; client deadline today.' } },
        admin,
      ),
    );
    expect(approved.status).toBe('APPROVED');

    const entry = await approvalAudit(revision.id);
    expect(entry?.status).toBe('APPROVED');
    expect(entry?.selfApprovalOverride?.reason).toContain('client deadline');
  });

  it('still refuses a creator who has no override authority, even if they send a reason', async () => {
    const { drawing, revision, version } = await revisionUnderReview(owningPlanner, 'A-702');
    await expect(
      inContext(() =>
        revisions.transition(
          projectId,
          drawing.id,
          revision.id,
          'approve',
          { version, override: { reason: 'Please let me approve my own drawing.' } },
          owningPlanner,
        ),
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      fields: [expect.objectContaining({ reason: expect.stringContaining('Director or System') })],
    });
    expect((await revisions.byId(projectId, drawing.id, revision.id)).status).toBe('UNDER_REVIEW');
  });

  it('ignores an override sent by a different approver: it is not recorded', async () => {
    const { drawing, revision, version } = await revisionUnderReview(owningPlanner, 'A-703');
    const approved = await inContext(() =>
      revisions.transition(
        projectId,
        drawing.id,
        revision.id,
        'approve',
        { version, override: { reason: 'Not needed, but sent anyway.' } },
        director,
      ),
    );
    expect(approved.status).toBe('APPROVED');
    expect((await approvalAudit(revision.id))?.selfApprovalOverride).toBeUndefined();
  });

  it('keeps the override a Director/Administrator-only authority in the permission matrix', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { permission: 'approval:override_self' },
    });
    expect(rows.map((r) => r.roleCode).sort()).toEqual(['DIRECTOR', 'SYSTEM_ADMINISTRATOR']);
    expect(rows.every((r) => r.scope === 'GLOBAL')).toBe(true);
  });
});
