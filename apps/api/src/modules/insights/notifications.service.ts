import type { NotificationItem } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';
import { DocumentService } from '../documents';
import { HandoverService } from '../handover';
import { SupervisionAgreementService } from '../supervision';

/**
 * The alerts the roadmap named for Phase 11 (docs/phase-11-plan.md §5) —
 * every one of them a fact an earlier phase's own table already holds.
 * Nothing here is stored, dismissed, or delivered; the list is recomputed on
 * every request, so there is no notification a background job needed to
 * have fired earlier.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly documents: DocumentService,
    private readonly handover: HandoverService,
    private readonly supervisionAgreements: SupervisionAgreementService,
  ) {}

  async list(userId: string): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];

    const visibleForPlanning = await this.authorization.visibleProjectIds(userId, 'planning:view');
    if (visibleForPlanning === null || visibleForPlanning.length > 0) {
      items.push(...(await this.overdueMilestones(visibleForPlanning)));
      items.push(...(await this.awaitingSubmissions(visibleForPlanning)));
    }

    const visibleForIssues = await this.authorization.visibleProjectIds(userId, 'issue:view');
    if (visibleForIssues === null || visibleForIssues.length > 0) {
      items.push(...(await this.overdueIssues(visibleForIssues)));
    }

    const visibleForSupervision = await this.authorization.visibleProjectIds(
      userId,
      'supervision:view',
    );
    if (visibleForSupervision === null || visibleForSupervision.length > 0) {
      items.push(...(await this.quotaApproaching(visibleForSupervision)));
    }

    const visibleForDocuments = await this.authorization.visibleProjectIds(userId, 'document:view');
    if (visibleForDocuments === null || visibleForDocuments.length > 0) {
      items.push(...(await this.missingDocuments(visibleForDocuments)));
    }

    const visibleForProjects = await this.authorization.visibleProjectIds(userId, 'project:view');
    if (visibleForProjects === null || visibleForProjects.length > 0) {
      items.push(...(await this.incompleteHandovers(visibleForProjects)));
    }

    return items;
  }

  private async overdueMilestones(visible: string[] | null): Promise<NotificationItem[]> {
    const milestones = await this.prisma.milestone.findMany({
      where: {
        ...(visible === null ? {} : { projectId: { in: visible } }),
        archivedAt: null,
        achievedDate: null,
        targetDate: { lt: new Date() },
      },
      select: { id: true, name: true, projectId: true },
    });
    return milestones.map((m) => ({
      type: 'MILESTONE_OVERDUE',
      severity: 'WARNING',
      message: `Milestone "${m.name}" is overdue.`,
      projectId: m.projectId,
      link: `/projects/${m.projectId}`,
    }));
  }

  private async awaitingSubmissions(visible: string[] | null): Promise<NotificationItem[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        ...(visible === null ? {} : { projectId: { in: visible } }),
        clarificationRequested: true,
        clarificationRespondedAt: null,
      },
      select: { id: true, reference: true, projectId: true },
    });
    return submissions.map((s) => ({
      type: 'SUBMISSION_AWAITING_RESPONSE',
      severity: 'WARNING',
      message: `Submission ${s.reference} is awaiting a clarification response.`,
      projectId: s.projectId,
      link: `/projects/${s.projectId}`,
    }));
  }

  private async overdueIssues(visible: string[] | null): Promise<NotificationItem[]> {
    const issues = await this.prisma.issue.findMany({
      where: {
        ...(visible === null ? {} : { projectId: { in: visible } }),
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
      },
      select: { id: true, title: true, projectId: true, severity: true },
    });
    return issues.map((i) => ({
      type: 'ISSUE_OVERDUE',
      severity: i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      message: `Issue "${i.title}" is overdue.`,
      projectId: i.projectId,
      link: `/projects/${i.projectId}`,
    }));
  }

  private async quotaApproaching(visible: string[] | null): Promise<NotificationItem[]> {
    const active = await this.prisma.supervisionAgreement.findMany({
      where: {
        ...(visible === null ? {} : { projectId: { in: visible } }),
        renewedAt: null,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { projectId: true },
    });

    const withUsage = await Promise.all(
      active.map((a) => this.supervisionAgreements.current(a.projectId)),
    );

    return withUsage
      .filter((a): a is NonNullable<typeof a> => a !== null && a.visitsAllowed > 0)
      .filter((a) => a.visitsUsed / a.visitsAllowed >= 0.8)
      .map(
        (a): NotificationItem => ({
          type: 'SUPERVISION_QUOTA_APPROACHING',
          severity: a.visitsUsed >= a.visitsAllowed ? 'CRITICAL' : 'WARNING',
          message: `Supervision visit quota nearly used (${a.visitsUsed}/${a.visitsAllowed}).`,
          projectId: a.projectId,
          link: `/projects/${a.projectId}`,
        }),
      );
  }

  private async missingDocuments(visible: string[] | null): Promise<NotificationItem[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        ...(visible === null ? {} : { id: { in: visible } }),
        status: { in: ['ACTIVE', 'ON_HOLD', 'COMPLETED'] },
      },
      select: { id: true, code: true },
    });

    const results = await Promise.all(
      projects.map(async (p) => ({ project: p, completeness: await this.documents.completeness(p.id) })),
    );

    return results
      .filter((r) => r.completeness.missingCount > 0)
      .map((r) => ({
        type: 'DOCUMENT_MISSING' as const,
        severity: 'INFO' as const,
        message: `${r.project.code} is missing ${r.completeness.missingCount} required document(s).`,
        projectId: r.project.id,
        link: `/projects/${r.project.id}`,
      }));
  }

  private async incompleteHandovers(visible: string[] | null): Promise<NotificationItem[]> {
    const completed = await this.prisma.project.findMany({
      where: {
        ...(visible === null ? {} : { id: { in: visible } }),
        status: 'COMPLETED',
      },
      select: { id: true, code: true },
    });

    const results = await Promise.all(
      completed.map(async (p) => ({ project: p, ready: await this.handover.isReady(p.id) })),
    );

    return results
      .filter((r) => !r.ready)
      .map((r) => ({
        type: 'HANDOVER_INCOMPLETE' as const,
        severity: 'INFO' as const,
        message: `${r.project.code} is complete but not yet ready for handover.`,
        projectId: r.project.id,
        link: `/projects/${r.project.id}`,
      }));
  }
}
