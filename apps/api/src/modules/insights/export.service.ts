import { Injectable } from '@nestjs/common';

import { toCsv } from '../../shared/csv/to-csv';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';
import { ClientService, PropertyService } from '../directory';
import { ProjectService } from '../projects';
import { ProposalService } from '../proposals';

/**
 * One CSV per already-listable register (docs/phase-11-plan.md §7) — each
 * pulls every row that register's own list endpoint would return for this
 * caller (`pageSize` raised to the full count), not a parallel query against
 * a second set of rules. `Issue` has no portfolio-wide list of its own (it is
 * read one project at a time — `docs/phase-2-plan.md`), so its export scopes
 * directly by `visibleProjectIds`, the same filter `ProjectService.list`
 * already applies for exactly this reason.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly clients: ClientService,
    private readonly properties: PropertyService,
    private readonly projects: ProjectService,
    private readonly proposals: ProposalService,
  ) {}

  async clientsCsv(): Promise<string> {
    const page = await this.clients.list({
      page: 1,
      pageSize: 100000,
      includeArchived: true,
    });
    return toCsv(
      ['id', 'name', 'reference', 'archivedAt'],
      page.items.map((c) => [c.id, c.name, c.reference, c.archivedAt?.toISOString() ?? '']),
    );
  }

  async propertiesCsv(): Promise<string> {
    const page = await this.properties.list({
      page: 1,
      pageSize: 100000,
      includeArchived: true,
    });
    return toCsv(
      ['id', 'clientId', 'name', 'plotNumber', 'wilayat', 'village', 'archivedAt'],
      page.items.map((p) => [
        p.id,
        p.clientId,
        p.name,
        p.plotNumber ?? '',
        p.wilayat ?? '',
        p.village ?? '',
        p.archivedAt?.toISOString() ?? '',
      ]),
    );
  }

  async projectsCsv(userId: string): Promise<string> {
    const page = await this.projects.list({ page: 1, pageSize: 100000 }, userId);
    return toCsv(
      ['id', 'code', 'name', 'type', 'status', 'clientId', 'propertyId'],
      page.items.map((p) => [p.id, p.code, p.name, p.type, p.status, p.clientId, p.propertyId]),
    );
  }

  async proposalsCsv(): Promise<string> {
    const page = await this.proposals.list({ page: 1, pageSize: 100000 });
    return toCsv(
      ['id', 'sketchNumber', 'contactName', 'status', 'projectType', 'convertedProjectId'],
      page.items.map((p) => [
        p.id,
        p.sketchNumber,
        p.contactName,
        p.status,
        p.projectType ?? '',
        p.convertedProjectId ?? '',
      ]),
    );
  }

  async issuesCsv(userId: string): Promise<string> {
    const visible = await this.authorization.visibleProjectIds(userId, 'issue:view');
    if (visible !== null && visible.length === 0) {
      return toCsv(['id', 'projectId', 'title', 'severity', 'status', 'dueDate'], []);
    }

    const issues = await this.prisma.issue.findMany({
      where: visible === null ? {} : { projectId: { in: visible } },
      orderBy: { createdAt: 'desc' },
    });
    return toCsv(
      ['id', 'projectId', 'title', 'severity', 'status', 'dueDate'],
      issues.map((i) => [
        i.id,
        i.projectId,
        i.title,
        i.severity,
        i.status,
        i.dueDate?.toISOString() ?? '',
      ]),
    );
  }
}
