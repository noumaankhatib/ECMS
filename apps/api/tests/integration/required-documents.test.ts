import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DocumentService } from '../../src/modules/documents/document.service';
import { RequiredDocumentService } from '../../src/modules/documents/required-document.service';
import { HandoverService } from '../../src/modules/handover';
import { ProjectService } from '../../src/modules/projects/project.service';
import { SequenceService } from '../../src/modules/sequence';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { LocalDriveAdapter } from '../../src/shared/drive/local-drive-adapter';

function fakeFile(content: string): {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
} {
  const buffer = Buffer.from(content, 'utf8');
  return { buffer, originalname: 'file.pdf', mimetype: 'application/pdf', size: buffer.length };
}

/**
 * Required documents (docs/phase-9-plan.md) — the admin-configurable
 * checklist, and the computed completeness diff against a project's own
 * uploaded categories. Same critical case as every other admin catalogue:
 * a non-admin gets nothing for mutation, but everyone with `document:view`
 * still sees the list — the same split `sketch_type:admin` already draws.
 */
describe('required documents', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const audit = new AuditService();
  const authorization = new AuthorizationService(prisma);
  const clients = new ClientService(prisma, audit);
  const properties = new PropertyService(prisma, audit);
  const projects = new ProjectService(
    prisma,
    audit,
    authorization,
    new SequenceService(),
    new HandoverService(prisma, audit),
  );
  const documents = new DocumentService(prisma, audit, new LocalDriveAdapter());
  const requiredDocuments = new RequiredDocumentService(prisma, audit);

  const requestId = '66666666-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `required-document-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode}`,
        passwordHash: 'not-used-in-this-test',
        roles: { create: { roleCode } },
      },
    });
    return user.id;
  }

  let admin: string;
  let documentController: string;
  let planner: string;
  let clientId: string;
  let propertyId: string;

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    documentController = await userWithRole('DOCUMENT_CONTROLLER');
    planner = await userWithRole('PLANNING');

    const client = await inContext(() =>
      clients.create({ name: `Required Document Client ${crypto.randomUUID()}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: 'Required Document House' }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // The critical test
  // ---------------------------------------------------------------------------

  it('gives a non-admin nothing for managing the catalogue, but keeps document:view able to list it', async () => {
    expect(await authorization.can(planner, 'required_document:admin')).toBe(false);
    expect(await authorization.can(documentController, 'required_document:admin')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Catalogue CRUD
  // ---------------------------------------------------------------------------

  it('creates a requirement and refuses a duplicate category/scope pair', async () => {
    const category = `Custom-${crypto.randomUUID().slice(0, 8)}`;
    const created = await requiredDocuments.create({
      category,
      label: 'A custom requirement',
      scope: 'PLANNING',
      sortOrder: 99,
    });
    expect(created.scope).toBe('PLANNING');

    await expect(
      requiredDocuments.create({ category, label: 'Duplicate', scope: 'PLANNING', sortOrder: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // The same category under a different scope is a different requirement.
    const sameCategoryDifferentScope = await requiredDocuments.create({
      category,
      label: 'Same category, supervision this time',
      scope: 'SUPERVISION',
      sortOrder: 1,
    });
    expect(sameCategoryDifferentScope.id).not.toBe(created.id);
  });

  it('edits label and sort order but leaves category immutable', async () => {
    const created = await requiredDocuments.create({
      category: `Editable-${crypto.randomUUID().slice(0, 8)}`,
      label: 'Original label',
      scope: 'ANY',
      sortOrder: 0,
    });

    const updated = await requiredDocuments.update(created.id, { label: 'New label' });
    expect(updated.label).toBe('New label');
    expect(updated.category).toBe(created.category);
  });

  it('retires a requirement instead of deleting it, and stops offering it in the active list', async () => {
    const created = await requiredDocuments.create({
      category: `Retiring-${crypto.randomUUID().slice(0, 8)}`,
      label: 'About to retire',
      scope: 'ANY',
      sortOrder: 0,
    });

    await requiredDocuments.archive(created.id);

    const active = await requiredDocuments.list();
    expect(active.some((r) => r.id === created.id)).toBe(false);

    const all = await requiredDocuments.list(true);
    expect(all.some((r) => r.id === created.id)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Completeness — the computed diff
  // ---------------------------------------------------------------------------

  it('flags a fresh project as missing every applicable requirement', async () => {
    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Completeness Test Project',
          type: 'PLANNING',
        },
        documentController,
      ),
    );

    const result = await documents.completeness(project.id);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.missingCount).toBe(result.items.length);
    expect(result.items.every((item) => !item.satisfied)).toBe(true);
  });

  it('matches an uploaded category case- and whitespace-insensitively, satisfying the requirement', async () => {
    const category = `Design-Match-${crypto.randomUUID().slice(0, 8)}`;
    await requiredDocuments.create({
      category,
      label: 'A design requirement',
      scope: 'ANY',
      sortOrder: 0,
    });

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Match Test Project',
          type: 'PLANNING',
        },
        documentController,
      ),
    );

    const before = await documents.completeness(project.id);
    const item = before.items.find((i) => i.category === category);
    expect(item?.satisfied).toBe(false);

    await inContext(() =>
      documents.create(
        project.id,
        { category: `  ${category.toUpperCase()}  `, title: 'Uploaded design pack' },
        fakeFile('bytes'),
        documentController,
      ),
    );

    const after = await documents.completeness(project.id);
    expect(after.items.find((i) => i.category === category)?.satisfied).toBe(true);
  });

  it('scopes a PLANNING requirement onto a BOTH project, but not onto a SUPERVISION-only one', async () => {
    const category = `Scoped-${crypto.randomUUID().slice(0, 8)}`;
    await requiredDocuments.create({
      category,
      label: 'Planning-only requirement',
      scope: 'PLANNING',
      sortOrder: 0,
    });

    const bothProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Both Type Project',
          type: 'BOTH',
        },
        documentController,
      ),
    );
    const supervisionProject = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Supervision Only Project',
          type: 'SUPERVISION',
        },
        documentController,
      ),
    );

    const bothResult = await documents.completeness(bothProject.id);
    expect(bothResult.items.some((i) => i.category === category)).toBe(true);

    const supervisionResult = await documents.completeness(supervisionProject.id);
    expect(supervisionResult.items.some((i) => i.category === category)).toBe(false);
  });

  it('excludes an archived requirement from the diff', async () => {
    const category = `Archived-${crypto.randomUUID().slice(0, 8)}`;
    const requirement = await requiredDocuments.create({
      category,
      label: 'Soon retired',
      scope: 'ANY',
      sortOrder: 0,
    });

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Archived Requirement Project',
          type: 'PLANNING',
        },
        documentController,
      ),
    );

    await requiredDocuments.archive(requirement.id);

    const result = await documents.completeness(project.id);
    expect(result.items.some((i) => i.requiredDocumentId === requirement.id)).toBe(false);
  });

  it('does not let an archived document satisfy a requirement', async () => {
    const category = `Archived-Doc-${crypto.randomUUID().slice(0, 8)}`;
    await requiredDocuments.create({
      category,
      label: 'Needs a non-archived upload',
      scope: 'ANY',
      sortOrder: 0,
    });

    const project = await inContext(() =>
      projects.create(
        {
          clientId,
          propertyId,
          code: `RDC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Archived Document Project',
          type: 'PLANNING',
        },
        documentController,
      ),
    );

    const document = await inContext(() =>
      documents.create(
        project.id,
        { category, title: 'Uploaded then archived' },
        fakeFile('bytes'),
        documentController,
      ),
    );
    await inContext(() => documents.archive(project.id, document.id, documentController));

    const result = await documents.completeness(project.id);
    expect(result.items.find((i) => i.category === category)?.satisfied).toBe(false);
  });
});
