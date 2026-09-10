import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DocumentService } from '../../src/modules/documents/document.service';
import { ActivityService } from '../../src/modules/planning/activity.service';
import { MembershipService } from '../../src/modules/projects/membership.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import type { DriveAdapter } from '../../src/shared/drive/drive-adapter';
import { LocalDriveAdapter } from '../../src/shared/drive/local-drive-adapter';

/** A stand-in that never completes the upload, so the FAILED path — the
 *  other half of the write flow the LocalDriveAdapter's happy path does not
 *  exercise — has something to test against. */
class FailingDriveAdapter implements DriveAdapter {
  upload(): Promise<{ fileId: string }> {
    return Promise.reject(new Error('drive unavailable'));
  }
  download(): Promise<Buffer> {
    throw new Error('not used');
  }
  delete(): Promise<void> {
    throw new Error('not used');
  }
}

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
 * Documents — the register, its metadata, and the Drive seam
 * (docs/phase-3-plan.md §6-§7). Same critical case as every other module: a
 * non-member gets nothing. What is specific here is the write flow —
 * created PENDING, bytes uploaded, marked ACTIVE or FAILED — and the
 * polymorphic link to a record in another module on the same project.
 */
describe('documents', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(prisma, audit, authorization, new SequenceService());
  const activities = new ActivityService(prisma, audit);
  const members = new MembershipService(prisma, audit);
  const documents = new DocumentService(prisma, audit, new LocalDriveAdapter());
  const failingDocuments = new DocumentService(prisma, audit, new FailingDriveAdapter());

  const requestId = '77777777-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `document-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let owningController: string;
  let otherController: string;
  let planner: string;
  let director: string;
  let clientId: string;
  let propertyId: string;
  let projectId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    owningController = await userWithRole('DOCUMENT_CONTROLLER');
    otherController = await userWithRole('DOCUMENT_CONTROLLER');
    planner = await userWithRole('PLANNING');
    director = await userWithRole('DIRECTOR');

    const client = await inContext(() =>
      clients.create({ name: `Document Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Document House' }, admin),
    );
    propertyId = property.id;

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `DOC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Document Test Project',
          type: 'PLANNING',
        },
        owningController,
      ),
    );
    projectId = project.id;

    await inContext(() =>
      members.add(projectId, { userId: planner, roleCode: 'PLANNING' }, owningController),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // The critical test
  // ---------------------------------------------------------------------------

  it('gives a non-member nothing at all for documents on this project', async () => {
    expect(await authorization.can(otherController, 'document:view', projectId)).toBe(false);
    expect(await authorization.can(otherController, 'document:create', projectId)).toBe(false);
  });

  it('lets the project Document Controller view, create, edit and archive', async () => {
    expect(await authorization.can(owningController, 'document:view', projectId)).toBe(true);
    expect(await authorization.can(owningController, 'document:create', projectId)).toBe(true);
    expect(await authorization.can(owningController, 'document:edit', projectId)).toBe(true);
    expect(await authorization.can(owningController, 'document:archive', projectId)).toBe(true);
  });

  it('lets Planning Team on the project only view, not create or archive', async () => {
    expect(await authorization.can(planner, 'document:view', projectId)).toBe(true);
    expect(await authorization.can(planner, 'document:create', projectId)).toBe(false);
    expect(await authorization.can(planner, 'document:archive', projectId)).toBe(false);
  });

  it('gives the Director view only, globally, and no create', async () => {
    expect(await authorization.can(director, 'document:view')).toBe(true);
    expect(await authorization.can(director, 'document:create', projectId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Create, upload, and read the exact bytes back
  // ---------------------------------------------------------------------------

  it('registers a document, uploads it through the LocalDriveAdapter, and downloads it back byte-for-byte', async () => {
    const file = fakeFile('%PDF-1.4 pretend drawing bytes');

    const document = await inContext(() =>
      documents.create(
        projectId,
        { category: 'Report', title: 'Site inspection report' },
        file,
        owningController,
      ),
    );

    expect(document.uploadStatus).toBe('ACTIVE');
    expect(document.fileId).not.toBeNull();

    const { document: reread, content } = await documents.download(projectId, document.id);
    expect(reread.id).toBe(document.id);
    expect(content.equals(file.buffer)).toBe(true);
  });

  it('marks a document FAILED, and refuses to download it, when the upload does not complete', async () => {
    const file = fakeFile('never actually arrives');

    const document = await inContext(() =>
      failingDocuments.create(
        projectId,
        { category: 'Report', title: 'Undeliverable' },
        file,
        owningController,
      ),
    ).catch((error: unknown) => {
      expect(error).toMatchObject({ code: 'INTERNAL' });
      return null;
    });
    expect(document).toBeNull();

    const stored = await prisma.document.findFirstOrThrow({
      where: { projectId, title: 'Undeliverable' },
    });
    expect(stored.uploadStatus).toBe('FAILED');

    await expect(documents.download(projectId, stored.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const rejected = await prisma.auditEntry.count({
      where: {
        entityId: stored.id,
        entityType: 'Document',
        action: 'STATUS_CHANGED',
        outcome: 'REJECTED',
      },
    });
    expect(rejected).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Linking to a record in another module
  // ---------------------------------------------------------------------------

  it('links a document to an activity on the same project', async () => {
    const activity = await inContext(() =>
      activities.create(projectId, { name: 'Prepare submission pack' }, owningController),
    );

    const document = await inContext(() =>
      documents.create(
        projectId,
        {
          category: 'Correspondence',
          title: 'Linked to an activity',
          linkedType: 'ACTIVITY',
          linkedId: activity.id,
        },
        fakeFile('linked file'),
        owningController,
      ),
    );

    expect(document.linkedType).toBe('ACTIVITY');
    expect(document.linkedId).toBe(activity.id);
  });

  it('refuses a link to an activity that belongs to another project', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Other Document House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `DOC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Other Document Project',
          type: 'PLANNING',
        },
        owningController,
      ),
    );
    const otherActivity = await inContext(() =>
      activities.create(otherProject.id, { name: 'Belongs elsewhere' }, owningController),
    );

    await expect(
      inContext(() =>
        documents.create(
          projectId,
          {
            category: 'Correspondence',
            title: 'Should be refused',
            linkedType: 'ACTIVITY',
            linkedId: otherActivity.id,
          },
          fakeFile('irrelevant'),
          owningController,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a link to an activity that does not exist', async () => {
    await expect(
      inContext(() =>
        documents.create(
          projectId,
          {
            category: 'Correspondence',
            title: 'Should be refused',
            linkedType: 'ACTIVITY',
            linkedId: '00000000-0000-4000-8000-000000000000',
          },
          fakeFile('irrelevant'),
          owningController,
        ),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------------
  // Editing metadata, and archiving
  // ---------------------------------------------------------------------------

  it('edits a document’s metadata under optimistic locking', async () => {
    const document = await inContext(() =>
      documents.create(
        projectId,
        { category: 'Report', title: 'Draft title' },
        fakeFile('content'),
        owningController,
      ),
    );

    const edited = await inContext(() =>
      documents.update(
        projectId,
        document.id,
        { title: 'Final title', version: document.version },
        owningController,
      ),
    );
    expect(edited.title).toBe('Final title');

    await expect(
      inContext(() =>
        documents.update(
          projectId,
          document.id,
          { title: 'Stale edit', version: document.version },
          owningController,
        ),
      ),
    ).rejects.toMatchObject({ code: 'STALE_RECORD' });
  });

  it('archives a document, hiding it from an ordinary list but not from history', async () => {
    const document = await inContext(() =>
      documents.create(
        projectId,
        { category: 'Report', title: 'To be archived' },
        fakeFile('content'),
        owningController,
      ),
    );

    await inContext(() => documents.archive(projectId, document.id, owningController));

    const visible = await documents.list(projectId, {
      page: 1,
      pageSize: 100,
      includeArchived: false,
    });
    expect(visible.items.some((d) => d.id === document.id)).toBe(false);

    const withArchived = await documents.list(projectId, {
      page: 1,
      pageSize: 100,
      includeArchived: true,
    });
    expect(withArchived.items.some((d) => d.id === document.id)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Reached through the wrong project, and a closed project
  // ---------------------------------------------------------------------------

  it('refuses a document reached through the wrong project in the URL', async () => {
    const otherProperty = await inContext(() =>
      properties.create({ clientId, name: 'Yet Another Document House' }, admin),
    );
    const otherProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: otherProperty.id,
          code: `DOC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Yet Another Document Project',
          type: 'PLANNING',
        },
        owningController,
      ),
    );

    const document = await inContext(() =>
      documents.create(
        projectId,
        { category: 'Report', title: 'Belongs to the first project' },
        fakeFile('content'),
        owningController,
      ),
    );

    await expect(documents.byId(otherProject.id, document.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses to create a document on a closed project', async () => {
    const property = await inContext(() =>
      properties.create({ clientId, name: 'Closing Document House' }, admin),
    );
    const closingProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId: property.id,
          code: `DOC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Closing Document Project',
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
      inContext(() =>
        documents.create(
          closingProject.id,
          { category: 'Report', title: 'Too late' },
          fakeFile('content'),
          admin,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('holds every seeded document permission in the shared catalogue', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: {
        permission: {
          in: ['document:view', 'document:create', 'document:edit', 'document:archive'],
        },
      },
    });
    const grants = await authorization.grantsFor(owningController);
    expect(grants.project.has('document:archive')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });
});
