import type { AdminDeleteItem } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/** Entity types that have an archivedAt column. */
const ARCHIVABLE = new Set([
  'client',
  'contact',
  'property',
  'planningActivity',
  'milestone',
  'document',
]);

/** Deletion order: children before parents, respecting FK Restrict constraints. */
const DELETE_ORDER: AdminDeleteItem['type'][] = [
  'submissionReview',
  'submissionMeeting',
  'instruction',
  'issue',
  'modification',
  'observation',
  'siteVisit',
  'submission',
  'drawingRevision',
  'drawing',
  'document',
  'planningActivity',
  'milestone',
  'supervisionAgreement',
  'handoverChecklist',
  'member',
  'workstream',
  'project',
  'proposal',
  'contact',
  'property',
  'client',
];

@Injectable()
export class AdminDeleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async archive(items: AdminDeleteItem[], actorId: string): Promise<void> {
    const nonArchivable = items.filter((i) => !ARCHIVABLE.has(i.type));
    if (nonArchivable.length > 0) {
      throw appError('CONFLICT', {
        fields: [{
          field: 'items',
          reason: `These types cannot be archived (only hard-deleted): ${[...new Set(nonArchivable.map((i) => i.type))].join(', ')}`,
        }],
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const byType = groupByType(items);

      if (byType.client?.length) {
        await tx.client.updateMany({ where: { id: { in: byType.client } }, data: { archivedAt: now, archivedBy: actorId } });
      }
      if (byType.contact?.length) {
        await tx.contact.updateMany({ where: { id: { in: byType.contact } }, data: { archivedAt: now } });
      }
      if (byType.property?.length) {
        await tx.property.updateMany({ where: { id: { in: byType.property } }, data: { archivedAt: now, archivedBy: actorId } });
      }
      if (byType.planningActivity?.length) {
        await tx.planningActivity.updateMany({ where: { id: { in: byType.planningActivity } }, data: { archivedAt: now } });
      }
      if (byType.milestone?.length) {
        await tx.milestone.updateMany({ where: { id: { in: byType.milestone } }, data: { archivedAt: now } });
      }
      if (byType.document?.length) {
        await tx.document.updateMany({ where: { id: { in: byType.document } }, data: { archivedAt: now, archivedBy: actorId } });
      }

      await this.audit.record(tx, {
        action: 'ADMIN_ARCHIVE',
        entityType: 'Mixed',
        after: { count: items.length, types: [...new Set(items.map((i) => i.type))] },
      });
    });
  }

  async hardDelete(
    items: AdminDeleteItem[],
    confirmName: string,
    rootLabel: string,
    _actorId: string,
  ): Promise<void> {
    if (confirmName.trim() !== rootLabel.trim()) {
      throw appError('VALIDATION_FAILED', {
        fields: [{ field: 'confirmName', reason: 'The name you typed does not match.' }],
      });
    }

    const sorted = sortByDeletionOrder(items);

    await this.prisma.$transaction(async (tx) => {
      const byType = groupByType(sorted);

      // Nullify drawing currentRevisionId before deleting revisions
      if (byType.drawingRevision?.length) {
        await tx.drawing.updateMany({
          where: { currentRevisionId: { in: byType.drawingRevision } },
          data: { currentRevisionId: null },
        });
      }

      // Nullify proposal convertedProjectId before deleting projects
      if (byType.project?.length) {
        await tx.proposal.updateMany({
          where: { convertedProjectId: { in: byType.project } },
          data: { convertedProjectId: null, convertedAt: null },
        });
      }

      // Nullify renewedFromId self-reference on supervisionAgreements
      if (byType.supervisionAgreement?.length) {
        await tx.supervisionAgreement.updateMany({
          where: { renewedFromId: { in: byType.supervisionAgreement } },
          data: { renewedFromId: null },
        });
      }

      if (byType.submissionReview?.length) {
        await tx.submissionReview.deleteMany({ where: { id: { in: byType.submissionReview } } });
      }
      if (byType.submissionMeeting?.length) {
        await tx.submissionMeeting.deleteMany({ where: { id: { in: byType.submissionMeeting } } });
      }
      if (byType.instruction?.length) {
        await tx.instruction.deleteMany({ where: { id: { in: byType.instruction } } });
      }
      if (byType.issue?.length) {
        await tx.issue.deleteMany({ where: { id: { in: byType.issue } } });
      }
      if (byType.modification?.length) {
        await tx.modification.deleteMany({ where: { id: { in: byType.modification } } });
      }
      if (byType.observation?.length) {
        await tx.observation.deleteMany({ where: { id: { in: byType.observation } } });
      }
      if (byType.siteVisit?.length) {
        await tx.siteVisit.deleteMany({ where: { id: { in: byType.siteVisit } } });
      }
      if (byType.submission?.length) {
        await tx.submission.deleteMany({ where: { id: { in: byType.submission } } });
      }
      if (byType.drawingRevision?.length) {
        await tx.drawingRevision.deleteMany({ where: { id: { in: byType.drawingRevision } } });
      }
      if (byType.drawing?.length) {
        await tx.drawing.deleteMany({ where: { id: { in: byType.drawing } } });
      }
      if (byType.document?.length) {
        await tx.document.deleteMany({ where: { id: { in: byType.document } } });
      }
      if (byType.planningActivity?.length) {
        await tx.planningActivity.deleteMany({ where: { id: { in: byType.planningActivity } } });
      }
      if (byType.milestone?.length) {
        await tx.milestone.deleteMany({ where: { id: { in: byType.milestone } } });
      }
      if (byType.supervisionAgreement?.length) {
        await tx.supervisionAgreement.deleteMany({ where: { id: { in: byType.supervisionAgreement } } });
      }
      if (byType.handoverChecklist?.length) {
        await tx.handoverChecklist.deleteMany({ where: { id: { in: byType.handoverChecklist } } });
      }
      if (byType.member?.length) {
        // member IDs are composite "projectId:userId"
        for (const compositeId of byType.member) {
          const colonIndex = compositeId.indexOf(':');
          if (colonIndex > 0) {
            const projectId = compositeId.slice(0, colonIndex);
            const userId = compositeId.slice(colonIndex + 1);
            await tx.projectMember.deleteMany({ where: { projectId, userId } });
          }
        }
      }
      if (byType.workstream?.length) {
        await tx.workstream.deleteMany({ where: { id: { in: byType.workstream } } });
      }
      if (byType.project?.length) {
        await tx.projectMember.deleteMany({ where: { projectId: { in: byType.project } } });
        await tx.workstream.deleteMany({ where: { projectId: { in: byType.project } } });
        await tx.project.deleteMany({ where: { id: { in: byType.project } } });
      }
      if (byType.proposal?.length) {
        await tx.proposal.deleteMany({ where: { id: { in: byType.proposal } } });
      }
      if (byType.contact?.length) {
        await tx.contact.deleteMany({ where: { id: { in: byType.contact } } });
      }
      if (byType.property?.length) {
        await tx.property.deleteMany({ where: { id: { in: byType.property } } });
      }
      if (byType.client?.length) {
        await tx.client.deleteMany({ where: { id: { in: byType.client } } });
      }

      await this.audit.record(tx, {
        action: 'ADMIN_HARD_DELETE',
        entityType: 'Mixed',
        after: {
          count: items.length,
          types: [...new Set(items.map((i) => i.type))],
          confirmedAs: confirmName,
        },
      });
    });
  }
}

function groupByType(
  items: AdminDeleteItem[],
): Partial<Record<AdminDeleteItem['type'], string[]>> {
  const result: Partial<Record<AdminDeleteItem['type'], string[]>> = {};
  for (const item of items) {
    (result[item.type] ??= []).push(item.id);
  }
  return result;
}

function sortByDeletionOrder(items: AdminDeleteItem[]): AdminDeleteItem[] {
  return [...items].sort((a, b) => {
    const ia = DELETE_ORDER.indexOf(a.type);
    const ib = DELETE_ORDER.indexOf(b.type);
    return ia - ib;
  });
}
