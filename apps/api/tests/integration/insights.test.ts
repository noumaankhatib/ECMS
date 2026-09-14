import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/access/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ClientService } from '../../src/modules/directory/client.service';
import { PropertyService } from '../../src/modules/directory/property.service';
import { DocumentService } from '../../src/modules/documents/document.service';
import { HandoverService } from '../../src/modules/handover';
import { DashboardService } from '../../src/modules/insights/dashboard.service';
import { ExportService } from '../../src/modules/insights/export.service';
import { NotificationsService } from '../../src/modules/insights/notifications.service';
import { SearchService } from '../../src/modules/insights/search.service';
import { ProjectService } from '../../src/modules/projects/project.service';
import { ProposalService } from '../../src/modules/proposals/proposal.service';
import { SequenceService } from '../../src/modules/sequence';
import { SupervisionAgreementService } from '../../src/modules/supervision/supervision-agreement.service';
import { runInRequestContext } from '../../src/shared/context/request-context';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { LocalDriveAdapter } from '../../src/shared/drive/local-drive-adapter';

/**
 * Insights (docs/phase-11-plan.md) — dashboard, notifications, search and
 * export, all four computed fresh from rows every earlier phase already
 * owns. The case this file exists for: every section is scoped by the same
 * permission and `visibleProjectIds` its own source resource already uses,
 * and is OMITTED (dashboard/notifications) or EMPTY (search/export) — never
 * a 403 or a fake answer — for a caller who holds nothing.
 */
describe('insights', () => {
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
  const proposals = new ProposalService(prisma, audit, new SequenceService());
  const documents = new DocumentService(prisma, audit, new LocalDriveAdapter());
  const supervisionAgreements = new SupervisionAgreementService(prisma, audit);

  const dashboard = new DashboardService(prisma, authorization, supervisionAgreements, handover);
  const notifications = new NotificationsService(
    prisma,
    authorization,
    documents,
    handover,
    supervisionAgreements,
  );
  const search = new SearchService(authorization, clients, properties, projects, proposals);
  const exportService = new ExportService(prisma, authorization, clients, properties, projects, proposals);

  const requestId = '88888888-2222-4111-8000-999999999999';
  const inContext = <T>(fn: () => Promise<T>): Promise<T> => runInRequestContext({ requestId }, fn);

  async function userWithRole(roleCode: string | null): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `insights-${crypto.randomUUID()}@example.com`,
        displayName: `Test ${roleCode ?? 'no-role'}`,
        passwordHash: 'not-used-in-this-test',
        ...(roleCode ? { roles: { create: { roleCode } } } : {}),
      },
    });
    return user.id;
  }

  let admin: string;
  let nobody: string;
  let clientId: string;
  let propertyId: string;
  const codeSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();

  beforeAll(async () => {
    admin = await userWithRole('SYSTEM_ADMINISTRATOR');
    nobody = await userWithRole(null);

    const client = await inContext(() =>
      clients.create({ name: `Insights Client ${codeSuffix}` }, admin),
    );
    clientId = client.id;

    const property = await inContext(() =>
      properties.create({ clientId, name: `Insights Property ${codeSuffix}` }, admin),
    );
    propertyId = property.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('omits every section for someone who holds no view permission at all', async () => {
    const summary = await dashboard.summary(nobody);
    expect(summary).toEqual({});

    const alerts = await notifications.list(nobody);
    expect(alerts).toEqual([]);

    const results = await search.search(nobody, codeSuffix);
    expect(results).toEqual([]);
  });

  it('dashboard counts a freshly created project under its own status', async () => {
    const project = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: `DASH-${codeSuffix}`, name: 'Dashboard project', type: 'SUPERVISION' },
        admin,
      ),
    );

    const summary = await dashboard.summary(admin);
    expect(summary.projects?.['DRAFT']).toBeGreaterThanOrEqual(1);
    expect(summary.projects).toBeDefined();
    expect(project.status).toBe('DRAFT');
  });

  it('raises an overdue-milestone alert once its target date has passed, and clears once achieved', async () => {
    const project = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: `MILE-${codeSuffix}`, name: 'Milestone project', type: 'PLANNING' },
        admin,
      ),
    );

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        name: 'Overdue milestone',
        targetDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const before = await notifications.list(admin);
    expect(before.some((n) => n.type === 'MILESTONE_OVERDUE' && n.projectId === project.id)).toBe(
      true,
    );

    await prisma.milestone.update({
      where: { id: milestone.id },
      data: { achievedDate: new Date() },
    });

    const after = await notifications.list(admin);
    expect(after.some((n) => n.type === 'MILESTONE_OVERDUE' && n.projectId === project.id)).toBe(
      false,
    );
  });

  it('search finds a project by its own code, and a client by name, but nothing for an unrelated term', async () => {
    const project = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: `SRCH-${codeSuffix}`, name: 'Search project', type: 'PLANNING' },
        admin,
      ),
    );

    const byCode = await search.search(admin, `SRCH-${codeSuffix}`);
    expect(byCode.some((r) => r.type === 'PROJECT' && r.id === project.id)).toBe(true);

    const byClientName = await search.search(admin, `Insights Client ${codeSuffix}`);
    expect(byClientName.some((r) => r.type === 'CLIENT' && r.id === clientId)).toBe(true);

    const nothing = await search.search(admin, `no-such-thing-${crypto.randomUUID()}`);
    expect(nothing).toEqual([]);
  });

  it('exports a CSV whose rows match what the register would show', async () => {
    const csv = await exportService.clientsCsv();
    expect(csv).toContain(`Insights Client ${codeSuffix}`);
    expect(csv.startsWith('id,name,reference,archivedAt\r\n')).toBe(true);
  });

  it('issues export scopes by visibleProjectIds the same way the project list does', async () => {
    const project = await inContext(() =>
      projects.create(
        { clientId, propertyId, code: `ISSU-${codeSuffix}`, name: 'Issue project', type: 'SUPERVISION' },
        admin,
      ),
    );
    await prisma.issue.create({
      data: { projectId: project.id, title: `Insights issue ${codeSuffix}`, status: 'OPEN' },
    });

    const csv = await exportService.issuesCsv(admin);
    expect(csv).toContain(`Insights issue ${codeSuffix}`);

    const emptyForNobody = await exportService.issuesCsv(nobody);
    expect(emptyForNobody).not.toContain(`Insights issue ${codeSuffix}`);
  });
});
