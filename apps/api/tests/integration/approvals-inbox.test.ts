import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { HandoverService } from '../../src/modules/handover';
import { ApprovalsInboxService } from '../../src/modules/insights/approvals-inbox.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * The Approvals inbox — a read-only cross-module union of items pending the
 * current user's approval (`DrawingRevision`, `Modification`, `Submission`,
 * and `Proposal`), each gated by exactly the permission its own approve
 * action already requires. Nothing here is stored; the same posture
 * `NotificationsService` already takes.
 */
describe('approvals inbox', () => {
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

  const approvalsInbox = new ApprovalsInboxService(prisma, authorization);

  const requestId = '77777777-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  const createdUserIds: string[] = [];
  const createdRoleCodes: string[] = [];

  async function userWithRole(roleCode: string | null): Promise<string> {
    const user = await prisma.user.create({
      data: {
        username: `apprinbox-${crypto.randomUUID()}`,
        email: `apprinbox-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode ?? 'no-role'}`,
        passwordHash: 'not-used-in-this-test',
        ...(roleCode ? { roles: { create: { roleCode } } } : {}),
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** Creates a throwaway role granting a single permission at PROJECT
   *  scope — the seed data only grants `drawing:approve` and
   *  `planning:approve` GLOBALLY (to SYSTEM_ADMINISTRATOR/DIRECTOR/
   *  PLANNING's global slice), so a PROJECT-scoped grant has to be
   *  fabricated here to exercise `visibleProjectIds`' membership scoping. */
  async function roleWithProjectScopedPermission(permission: string): Promise<string> {
    const code = `TEST_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await prisma.role.create({
      data: {
        code,
        name: code,
        description: 'Throwaway role created for the approvals-inbox test.',
        sortOrder: 999,
        permissions: { create: { permission, scope: 'PROJECT' } },
      },
    });
    createdRoleCodes.push(code);
    return code;
  }

  let admin: string;
  let clientId: string;
  let propertyId: string;
  const codeSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');

    const client = await inContext(() =>
      clients.create({ name: `Approvals Client ${codeSuffix}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: `Approvals Property ${codeSuffix}` }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.projectMember.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { code: { in: createdRoleCodes } } });
    await prisma.$disconnect();
  });

  async function createProject(code: string) {
    return inContext(() =>
      projects.create(
        { clientId, propertyId, code, name: code, type: 'PLANNING' },
        admin,
      ),
    );
  }

  it('scopes pending drawing revisions to the projects the caller holds drawing:approve on', async () => {
    const projectA = await createProject(`APPR-DA-${codeSuffix}`);
    const projectB = await createProject(`APPR-DB-${codeSuffix}`);

    const drawingA = await prisma.drawing.create({
      data: { projectId: projectA.id, number: `DWG-A-${codeSuffix}`, title: 'Drawing A' },
    });
    const drawingB = await prisma.drawing.create({
      data: { projectId: projectB.id, number: `DWG-B-${codeSuffix}`, title: 'Drawing B' },
    });
    const revisionA = await prisma.drawingRevision.create({
      data: { drawingId: drawingA.id, revisionCode: 'P1', status: 'SUBMITTED' },
    });
    await prisma.drawingRevision.create({
      data: { drawingId: drawingB.id, revisionCode: 'P1', status: 'SUBMITTED' },
    });

    const roleCode = await roleWithProjectScopedPermission('drawing:approve');
    const approver = await userWithRole(roleCode);
    // `project_member.role_code` is checked against the fixed catalogue of
    // real role codes (it is a record of what someone DOES on the project,
    // kept for display — see `AuthorizationService.isMemberOf`'s own
    // comment). It plays no part in the permission check itself, which
    // comes from the throwaway role granted via `UserRole` above; membership
    // alone is what scopes `visibleProjectIds`.
    await prisma.projectMember.create({
      data: { projectId: projectA.id, userId: approver, roleCode: 'PLANNING' },
    });

    const inbox = await approvalsInbox.list(approver);
    const drawingItems = inbox.filter((i) => i.entityType === 'DrawingRevision');

    expect(drawingItems.some((i) => i.id === revisionA.id && i.projectId === projectA.id)).toBe(
      true,
    );
    expect(drawingItems.some((i) => i.projectId === projectB.id)).toBe(false);
  });

  it("excludes a submission from its own creator's inbox even though it is pending", async () => {
    const project = await createProject(`APPR-SUB-${codeSuffix}`);

    const roleCode = await roleWithProjectScopedPermission('planning:approve');
    const creator = await userWithRole(roleCode);
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: creator, roleCode: 'PLANNING' },
    });

    const submission = await prisma.submission.create({
      data: {
        projectId: project.id,
        reference: `SUB-${codeSuffix}`,
        authorityName: 'Local Planning Authority',
        status: 'SUBMITTED',
        createdBy: creator,
      },
    });

    const creatorInbox = await approvalsInbox.list(creator);
    expect(creatorInbox.some((i) => i.entityType === 'Submission' && i.id === submission.id)).toBe(
      false,
    );

    // A second holder of the same project-scoped permission, who did not
    // create it, does see it.
    const otherApprover = await userWithRole(roleCode);
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: otherApprover, roleCode: 'PLANNING' },
    });
    const otherInbox = await approvalsInbox.list(otherApprover);
    expect(otherInbox.some((i) => i.entityType === 'Submission' && i.id === submission.id)).toBe(
      true,
    );
  });

  it('shows a holder of only proposal:edit the pending proposals, and nothing else', async () => {
    const project = await createProject(`APPR-PROP-${codeSuffix}`);
    const drawing = await prisma.drawing.create({
      data: { projectId: project.id, number: `DWG-PROP-${codeSuffix}`, title: 'Drawing' },
    });
    await prisma.drawingRevision.create({
      data: { drawingId: drawing.id, revisionCode: 'P1', status: 'SUBMITTED' },
    });
    await prisma.modification.create({
      data: {
        projectId: project.id,
        requestText: 'A client change request',
        impactArea: 'ARCHITECTURE',
        status: 'SUBMITTED',
      },
    });
    await prisma.submission.create({
      data: {
        projectId: project.id,
        reference: `SUB-PROP-${codeSuffix}`,
        authorityName: 'Local Planning Authority',
        status: 'SUBMITTED',
      },
    });

    const proposal = await prisma.proposal.create({
      data: {
        contactName: `Approvals Proposal Contact ${codeSuffix}`,
        sketchNumber: `SK-${crypto.randomUUID().slice(0, 8)}`,
        status: 'CLIENT_REVISION',
      },
    });

    // `proposal:edit` is granted globally to PROJECT_MANAGER in the seed
    // catalogue, and it carries neither `drawing:approve` nor
    // `planning:approve` (project-scoped or otherwise).
    const proposalOnly = await userWithRole('PROJECT_MANAGER');

    const inbox = await approvalsInbox.list(proposalOnly);

    expect(inbox.some((i) => i.entityType === 'Proposal' && i.id === proposal.id)).toBe(true);
    expect(inbox.some((i) => i.entityType === 'DrawingRevision')).toBe(false);
    expect(inbox.some((i) => i.entityType === 'Modification')).toBe(false);
    expect(inbox.some((i) => i.entityType === 'Submission')).toBe(false);
  });
});
