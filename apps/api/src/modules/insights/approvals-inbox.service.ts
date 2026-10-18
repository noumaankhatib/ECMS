import { formatClientName, type ApprovalInboxItem } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';

const PENDING_STATUSES = ['SUBMITTED', 'UNDER_REVIEW'];

/** Everything needed to show which project and client an item belongs to. */
const PROJECT_CONTEXT = {
  select: {
    id: true,
    code: true,
    name: true,
    client: {
      select: { firstName: true, fatherName: true, grandfatherName: true, surname: true },
    },
  },
} as const;

type ProjectContext = {
  code: string;
  name: string;
  client: {
    firstName: string | null;
    fatherName: string | null;
    grandfatherName: string | null;
    surname: string | null;
  };
};

function contextOf(project: ProjectContext): {
  projectCode: string;
  projectName: string;
  clientName: string;
} {
  return {
    projectCode: project.code,
    projectName: project.name,
    clientName: formatClientName(project.client),
  };
}

type PendingItem = Omit<ApprovalInboxItem, 'submittedByName'>;

const NO_CONTEXT = { projectCode: null, projectName: null, clientName: null };

/**
 * Approvals inbox — a read-only cross-module list of items pending the
 * current user's approval, unioned from every model that carries the
 * shared `ApprovalStatus` state machine (`DrawingRevision`, `Modification`,
 * `Submission`) plus `Proposal`'s own separate machine. Nothing here is
 * stored, dismissed, or delivered; the list is recomputed on every request,
 * the same posture `NotificationsService` already takes.
 */
@Injectable()
export class ApprovalsInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string): Promise<ApprovalInboxItem[]> {
    const items: PendingItem[] = [];

    const visibleForDrawings = await this.authorization.visibleProjectIds(
      userId,
      'drawing:approve',
    );
    if (visibleForDrawings === null || visibleForDrawings.length > 0) {
      items.push(...(await this.pendingDrawingRevisions(visibleForDrawings)));
    }

    const visibleForPlanning = await this.authorization.visibleProjectIds(
      userId,
      'planning:approve',
    );
    if (visibleForPlanning === null || visibleForPlanning.length > 0) {
      items.push(...(await this.pendingModifications(visibleForPlanning)));
      items.push(...(await this.pendingSubmissions(visibleForPlanning, userId)));
    }

    if (await this.authorization.can(userId, 'proposal:edit')) {
      items.push(...(await this.pendingProposals()));
    }

    return this.withSubmitterNames(items);
  }

  /** Display names for the people who submitted, in one query for the whole list. */
  private async withSubmitterNames(items: PendingItem[]): Promise<ApprovalInboxItem[]> {
    const ids = [...new Set(items.map((i) => i.submittedBy).filter((id): id is string => !!id))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    return items
      .map((i): ApprovalInboxItem => ({
        ...i,
        submittedByName: i.submittedBy ? (names.get(i.submittedBy) ?? null) : null,
      }))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  private async pendingDrawingRevisions(visible: string[] | null): Promise<PendingItem[]> {
    const revisions = await this.prisma.drawingRevision.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        drawing: {
          ...(visible === null ? {} : { projectId: { in: visible } }),
        },
      },
      select: {
        id: true,
        revisionCode: true,
        status: true,
        createdAt: true,
        createdBy: true,
        drawing: {
          select: { id: true, number: true, projectId: true, project: PROJECT_CONTEXT },
        },
      },
    });

    return revisions.map((r): PendingItem => ({
      entityType: 'DrawingRevision',
      id: r.id,
      title: `Drawing ${r.drawing.number} revision ${r.revisionCode}`,
      projectId: r.drawing.projectId,
      submittedBy: r.createdBy,
      submittedAt: r.createdAt.toISOString(),
      link: `/projects/${r.drawing.projectId}/drawings/${r.drawing.id}`,
      status: r.status,
      ...contextOf(r.drawing.project),
    }));
  }

  private async pendingModifications(visible: string[] | null): Promise<PendingItem[]> {
    const modifications = await this.prisma.modification.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        ...(visible === null ? {} : { projectId: { in: visible } }),
      },
      select: {
        id: true,
        requestText: true,
        status: true,
        projectId: true,
        createdAt: true,
        createdBy: true,
        project: PROJECT_CONTEXT,
      },
    });

    return modifications.map((m): PendingItem => ({
      entityType: 'Modification',
      id: m.id,
      title: `Modification: ${m.requestText.slice(0, 80)}`,
      projectId: m.projectId,
      submittedBy: m.createdBy,
      submittedAt: m.createdAt.toISOString(),
      link: `/projects/${m.projectId}/modifications`,
      status: m.status,
      ...contextOf(m.project),
    }));
  }

  private async pendingSubmissions(
    visible: string[] | null,
    userId: string,
  ): Promise<PendingItem[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        // A submission's own creator cannot approve it (the same exclusion
        // `SubmissionService.transition()` already enforces) — so it never
        // belongs in their own inbox either.
        createdBy: { not: userId },
        ...(visible === null ? {} : { projectId: { in: visible } }),
      },
      select: {
        id: true,
        reference: true,
        status: true,
        projectId: true,
        createdAt: true,
        createdBy: true,
        project: PROJECT_CONTEXT,
      },
    });

    return submissions.map((s): PendingItem => ({
      entityType: 'Submission',
      id: s.id,
      title: `Submission ${s.reference}`,
      projectId: s.projectId,
      submittedBy: s.createdBy,
      submittedAt: s.createdAt.toISOString(),
      link: `/projects/${s.projectId}/planning/submissions/${s.id}`,
      status: s.status,
      ...contextOf(s.project),
    }));
  }

  private async pendingProposals(): Promise<PendingItem[]> {
    const proposals = await this.prisma.proposal.findMany({
      where: { status: 'CLIENT_REVISION' },
      select: {
        id: true,
        sketchNumber: true,
        contactName: true,
        status: true,
        createdAt: true,
        createdBy: true,
        client: {
          select: { firstName: true, fatherName: true, grandfatherName: true, surname: true },
        },
      },
    });

    return proposals.map((p): PendingItem => ({
      entityType: 'Proposal',
      id: p.id,
      title: `Proposal ${p.sketchNumber} — ${p.contactName}`,
      projectId: null,
      submittedBy: p.createdBy,
      submittedAt: p.createdAt.toISOString(),
      link: `/proposals/${p.id}/edit`,
      status: p.status,
      ...NO_CONTEXT,
      clientName: p.client ? formatClientName(p.client) : p.contactName,
    }));
  }
}
