import type { HandoverStatus, UpdateHandoverChecklist } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { HandoverChecklist, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

const CHECKLIST_FIELD_TO_COLUMN = {
  finalInspectionDone: 'finalInspectionAt',
  authorityDocsReceived: 'authorityDocsReceivedAt',
  testsReceived: 'testsReceivedAt',
  asBuiltReceived: 'asBuiltReceivedAt',
  warrantiesReceived: 'warrantiesReceivedAt',
  finalReportIssued: 'finalReportIssuedAt',
} as const satisfies Record<string, keyof HandoverChecklist>;

const CHECKLIST_COLUMNS = Object.values(CHECKLIST_FIELD_TO_COLUMN);

/** Every checklist column is complete only when none of the six is null. */
function isChecklistComplete(checklist: HandoverChecklist): boolean {
  return CHECKLIST_COLUMNS.every((column) => checklist[column] !== null);
}

/**
 * The Closure-phase checklist (docs/phase-10-plan.md) — one row per project,
 * created lazily on first read or edit. Open issues and missing documents
 * are computed here from real `Issue`/`Document` rows, never stored, the
 * same "derive, don't duplicate" choice Phase 7 and Phase 9 already made.
 * Reimplements Phase 9's own completeness count rather than importing
 * `DocumentService` — a module may only reach into another module's
 * `index`, and this small count is cheaper to duplicate than to expose.
 */
@Injectable()
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(projectId: string): Promise<HandoverStatus> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw appError('NOT_FOUND');

    const checklist = await this.prisma.handoverChecklist.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    return this.toStatus(checklist);
  }

  async update(projectId: string, input: UpdateHandoverChecklist): Promise<HandoverStatus> {
    const checklist = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.handoverChecklist.upsert({
        where: { projectId },
        create: { projectId },
        update: {},
      });

      const { version: _version, ...fields } = input;
      const data: Prisma.HandoverChecklistUpdateManyMutationInput = {
        version: { increment: 1 },
      };
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        const column = CHECKLIST_FIELD_TO_COLUMN[field as keyof typeof CHECKLIST_FIELD_TO_COLUMN];
        (data as Record<string, unknown>)[column] = value ? new Date() : null;
      }

      const { count } = await tx.handoverChecklist.updateMany({
        where: { projectId, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { project_id: projectId } });

      const after = await tx.handoverChecklist.findUniqueOrThrow({ where: { projectId } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'HandoverChecklist',
        entityId: after.id,
        projectId,
        before: this.snapshot(before),
        after: this.snapshot(after),
      });

      return after;
    });

    return this.toStatus(checklist);
  }

  /** The gate `ProjectService.transition()` consults before allowing
   *  `close` (docs/phase-10-plan.md §4). A project with no checklist row
   *  yet is exactly as incomplete as one whose row has every field unset. */
  async isReady(projectId: string): Promise<boolean> {
    return (await this.status(projectId)).ready;
  }

  private async toStatus(checklist: HandoverChecklist): Promise<HandoverStatus> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: checklist.projectId },
      select: { type: true },
    });
    const workstreams: readonly string[] =
      project.type === 'BOTH' ? ['PLANNING', 'SUPERVISION'] : [project.type];

    const [openIssueCount, requirements, documents] = await Promise.all([
      this.prisma.issue.count({
        where: { projectId: checklist.projectId, status: { not: 'CLOSED' } },
      }),
      this.prisma.requiredDocument.findMany({ where: { archivedAt: null } }),
      this.prisma.document.findMany({
        where: { projectId: checklist.projectId, archivedAt: null },
        select: { category: true },
      }),
    ]);

    const uploadedCategories = new Set(
      documents.map((document) => document.category.trim().toLowerCase()),
    );
    const missingDocumentCount = requirements.filter(
      (requirement) =>
        (requirement.scope === 'ANY' || workstreams.includes(requirement.scope)) &&
        !uploadedCategories.has(requirement.category.trim().toLowerCase()),
    ).length;

    return {
      projectId: checklist.projectId,
      version: checklist.version,
      finalInspectionAt: checklist.finalInspectionAt?.toISOString() ?? null,
      authorityDocsReceivedAt: checklist.authorityDocsReceivedAt?.toISOString() ?? null,
      testsReceivedAt: checklist.testsReceivedAt?.toISOString() ?? null,
      asBuiltReceivedAt: checklist.asBuiltReceivedAt?.toISOString() ?? null,
      warrantiesReceivedAt: checklist.warrantiesReceivedAt?.toISOString() ?? null,
      finalReportIssuedAt: checklist.finalReportIssuedAt?.toISOString() ?? null,
      openIssueCount,
      missingDocumentCount,
      ready: openIssueCount === 0 && missingDocumentCount === 0 && isChecklistComplete(checklist),
    };
  }

  private snapshot(checklist: HandoverChecklist): Record<string, string | null> {
    return Object.fromEntries(
      CHECKLIST_COLUMNS.map((column) => [column, checklist[column]?.toISOString() ?? null]),
    );
  }
}
