import { PROJECT_STATUSES, PROPOSAL_STATUSES, type DashboardSummary } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';
import { HandoverService } from '../handover';
import { SupervisionAgreementService } from '../supervision';

/**
 * Portfolio-wide counts, each computed fresh from the same rows the
 * resource's own list/detail endpoints already read (docs/phase-11-plan.md
 * §4) — never stored, never a second source of truth.
 *
 * A section is a key on the returned object only when the caller holds the
 * permission that section's own resource already requires. Omitted, not
 * zeroed: a zero would claim "there are none"; absence says "not shown to
 * you", the same distinction the rest of this codebase draws between "empty"
 * and "forbidden".
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly supervisionAgreements: SupervisionAgreementService,
    private readonly handover: HandoverService,
  ) {}

  async summary(userId: string): Promise<DashboardSummary> {
    const summary: DashboardSummary = {};

    const visibleProjects = await this.authorization.visibleProjectIds(userId, 'project:view');
    if (visibleProjects === null || visibleProjects.length > 0) {
      summary.projects = await this.projectCounts(visibleProjects);
    }

    if (await this.authorization.canAnywhere(userId, 'proposal:view')) {
      summary.proposals = await this.proposalCounts();
    }

    const visibleForIssues = await this.authorization.visibleProjectIds(userId, 'issue:view');
    if (visibleForIssues === null || visibleForIssues.length > 0) {
      summary.issues = await this.issueCounts(visibleForIssues);
    }

    const visibleForSupervision = await this.authorization.visibleProjectIds(
      userId,
      'supervision:view',
    );
    if (visibleForSupervision === null || visibleForSupervision.length > 0) {
      summary.supervisionAgreements = await this.supervisionCounts(visibleForSupervision);
    }

    if (visibleProjects === null || visibleProjects.length > 0) {
      summary.handover = await this.handoverCounts(visibleProjects);
    }

    return summary;
  }

  private async projectCounts(visible: string[] | null): Promise<Record<string, number>> {
    const rows = await this.prisma.project.groupBy({
      by: ['status'],
      where: visible === null ? {} : { id: { in: visible } },
      _count: { _all: true },
    });
    return this.fillZeros(PROJECT_STATUSES, rows.map((r) => [r.status, r._count._all] as const));
  }

  private async proposalCounts(): Promise<Record<string, number>> {
    const rows = await this.prisma.proposal.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return this.fillZeros(PROPOSAL_STATUSES, rows.map((r) => [r.status, r._count._all] as const));
  }

  private async issueCounts(
    visible: string[] | null,
  ): Promise<{ open: number; closed: number; overdue: number }> {
    const where = visible === null ? {} : { projectId: { in: visible } };
    const [open, closed, overdue] = await Promise.all([
      this.prisma.issue.count({ where: { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.issue.count({ where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.issue.count({
        where: {
          ...where,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);
    return { open, closed, overdue };
  }

  private async supervisionCounts(
    visible: string[] | null,
  ): Promise<{ active: number; nearingQuota: number }> {
    const where = {
      ...(visible === null ? {} : { projectId: { in: visible } }),
      renewedAt: null,
      startDate: { lte: new Date() },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    };

    const activeAgreements = await this.prisma.supervisionAgreement.findMany({
      where,
      select: { projectId: true },
    });

    const withUsage = await Promise.all(
      activeAgreements.map((a) => this.supervisionAgreements.current(a.projectId)),
    );

    const nearingQuota = withUsage.filter(
      (a) => a !== null && a.visitsAllowed > 0 && a.visitsUsed / a.visitsAllowed >= 0.8,
    ).length;

    return { active: activeAgreements.length, nearingQuota };
  }

  private async handoverCounts(
    visible: string[] | null,
  ): Promise<{ completedNotClosed: number; ready: number }> {
    const where = {
      ...(visible === null ? {} : { id: { in: visible } }),
      status: 'COMPLETED' as const,
    };
    const completed = await this.prisma.project.findMany({ where, select: { id: true } });

    // Reuses `HandoverService.isReady` — the exact same rule
    // `ProjectService.transition()` gates `close` on — rather than
    // re-deriving "ready" a second way (docs/phase-10-plan.md §4).
    const readiness = await Promise.all(completed.map((p) => this.handover.isReady(p.id)));

    return { completedNotClosed: completed.length, ready: readiness.filter(Boolean).length };
  }

  private fillZeros(
    statuses: readonly string[],
    counted: readonly (readonly [string, number])[],
  ): Record<string, number> {
    const counts = new Map(counted);
    return Object.fromEntries(statuses.map((s) => [s, counts.get(s) ?? 0]));
  }
}
