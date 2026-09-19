import type { ApprovalInboxItem } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';

const PENDING_STATUSES = ['SUBMITTED', 'UNDER_REVIEW'];

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
    const items: ApprovalInboxItem[] = [];

    const visibleForDrawings = await this.authorization.visibleProjectIds(userId, 'drawing:approve');
    if (visibleForDrawings === null || visibleForDrawings.length > 0) {
      items.push(...(await this.pendingDrawingRevisions(visibleForDrawings)));
    }

    const visibleForPlanning = await this.authorization.visibleProjectIds(userId, 'planning:approve');
    if (visibleForPlanning === null || visibleForPlanning.length > 0) {
      items.push(...(await this.pendingModifications(visibleForPlanning)));
      items.push(...(await this.pendingSubmissions(visibleForPlanning, userId)));
    }

    if (await this.authorization.can(userId, 'proposal:edit')) {
      items.push(...(await this.pendingProposals()));
    }

    return items;
  }

  private async pendingDrawingRevisions(visible: string[] | null): Promise<ApprovalInboxItem[]> {
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
        createdAt: true,
        createdBy: true,
        drawing: { select: { id: true, number: true, projectId: true } },
      },
    });

    return revisions.map(
      (r): ApprovalInboxItem => ({
        entityType: 'DrawingRevision',
        id: r.id,
        title: `Drawing ${r.drawing.number} revision ${r.revisionCode}`,
        projectId: r.drawing.projectId,
        submittedBy: r.createdBy,
        submittedAt: r.createdAt.toISOString(),
        link: `/projects/${r.drawing.projectId}/drawings/${r.drawing.id}`,
      }),
    );
  }

  private async pendingModifications(visible: string[] | null): Promise<ApprovalInboxItem[]> {
    const modifications = await this.prisma.modification.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        ...(visible === null ? {} : { projectId: { in: visible } }),
      },
      select: { id: true, requestText: true, projectId: true, createdAt: true, createdBy: true },
    });

    return modifications.map(
      (m): ApprovalInboxItem => ({
        entityType: 'Modification',
        id: m.id,
        title: `Modification: ${m.requestText.slice(0, 80)}`,
        projectId: m.projectId,
        submittedBy: m.createdBy,
        submittedAt: m.createdAt.toISOString(),
        link: `/projects/${m.projectId}/modifications`,
      }),
    );
  }

  private async pendingSubmissions(
    visible: string[] | null,
    userId: string,
  ): Promise<ApprovalInboxItem[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: { in: PENDING_STATUSES },
        // A submission's own creator cannot approve it (the same exclusion
        // `SubmissionService.transition()` already enforces) — so it never
        // belongs in their own inbox either.
        createdBy: { not: userId },
        ...(visible === null ? {} : { projectId: { in: visible } }),
      },
      select: { id: true, reference: true, projectId: true, createdAt: true, createdBy: true },
    });

    return submissions.map(
      (s): ApprovalInboxItem => ({
        entityType: 'Submission',
        id: s.id,
        title: `Submission ${s.reference}`,
        projectId: s.projectId,
        submittedBy: s.createdBy,
        submittedAt: s.createdAt.toISOString(),
        link: `/projects/${s.projectId}/planning/submissions/${s.id}`,
      }),
    );
  }

  private async pendingProposals(): Promise<ApprovalInboxItem[]> {
    const proposals = await this.prisma.proposal.findMany({
      where: { status: 'CLIENT_REVISION' },
      select: { id: true, sketchNumber: true, contactName: true, createdAt: true, createdBy: true },
    });

    return proposals.map(
      (p): ApprovalInboxItem => ({
        entityType: 'Proposal',
        id: p.id,
        title: `Proposal ${p.sketchNumber} — ${p.contactName}`,
        projectId: null,
        submittedBy: p.createdBy,
        submittedAt: p.createdAt.toISOString(),
        link: `/proposals/${p.id}/edit`,
      }),
    );
  }
}
