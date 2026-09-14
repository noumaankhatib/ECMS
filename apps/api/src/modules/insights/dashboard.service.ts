import {
  PROJECT_STATUSES,
  PROPOSAL_STATUSES,
  type ActivityAction,
  type ActivityItem,
  type DashboardSummary,
  type DeadlineItem,
  type DeadlineStatus,
  type ProjectStatus,
  type ProposalStatus,
  type Trend,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { AuthorizationService } from '../access';
import { HandoverService } from '../handover';
import { SupervisionAgreementService } from '../supervision';

/** Audit actions worth a business "recent activity" feed — sign-in and
 *  permission-refusal noise is excluded (docs/phase-11-plan.md's own
 *  successor note: this is not an audit-log viewer, which would need its
 *  own permission model to show `before`/`after`; this only ever shows
 *  action/entity/timestamp). */
const ACTIVITY_ACTIONS: readonly ActivityAction[] = [
  'CREATED',
  'UPDATED',
  'ARCHIVED',
  'RESTORED',
  'STATUS_CHANGED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function deadlineStatus(date: Date, now: Date): DeadlineStatus {
  if (date.getTime() < now.getTime()) return 'OVERDUE';
  if (date.getTime() - now.getTime() <= THREE_DAYS_MS) return 'PENDING';
  return 'UPCOMING';
}

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

    if (await this.authorization.canAnywhere(userId, 'client:view')) {
      summary.clients = await this.trendFor('client', {});
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

    // Omitted, not an empty array, when the caller holds none of the
    // permissions `recentActivity` itself would ever draw from — the same
    // "absence, not a fake answer" rule every other section follows.
    const canSeeAnyActivity =
      (visibleProjects === null || visibleProjects.length > 0) ||
      (await this.authorization.canAnywhere(userId, 'client:view')) ||
      (await this.authorization.canAnywhere(userId, 'proposal:view')) ||
      (await this.authorization.canAnywhere(userId, 'user:view'));
    if (canSeeAnyActivity) {
      summary.recentActivity = await this.recentActivity(userId, visibleProjects);
    }

    const visibleForPlanning = await this.authorization.visibleProjectIds(userId, 'planning:view');
    const deadlines = await this.upcomingDeadlines(visibleForPlanning, visibleForIssues);
    if (deadlines.length > 0) {
      summary.upcomingDeadlines = deadlines;
    }

    return summary;
  }

  private async projectCounts(
    visible: string[] | null,
  ): Promise<Record<ProjectStatus, number> & { trend?: Trend }> {
    const rows = await this.prisma.project.groupBy({
      by: ['status'],
      where: visible === null ? {} : { id: { in: visible } },
      _count: { _all: true },
    });
    const counts = this.fillZeros(
      PROJECT_STATUSES,
      rows.map((r) => [r.status, r._count._all] as const),
    );
    const trend = await this.trendFor('project', visible === null ? {} : { id: { in: visible } });
    return { ...counts, trend };
  }

  private async proposalCounts(): Promise<Record<ProposalStatus, number> & { trend?: Trend }> {
    const rows = await this.prisma.proposal.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = this.fillZeros(
      PROPOSAL_STATUSES,
      rows.map((r) => [r.status, r._count._all] as const),
    );
    const trend = await this.trendFor('proposal', {});
    return { ...counts, trend };
  }

  /**
   * A percentage change over the trailing 30 days vs. the 30 days before
   * that, from real `createdAt` rows — never a fabricated figure, and
   * `changePercent` is `null` (not zero, not omitted) when the prior window
   * has nothing to compare against.
   */
  private async trendFor(
    model: 'project' | 'proposal' | 'client',
    scopeWhere: Record<string, unknown>,
  ): Promise<Trend> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const priorStart = new Date(now.getTime() - 2 * THIRTY_DAYS_MS);

    const delegate = this.prisma[model] as unknown as {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };

    const [total, recent, prior] = await Promise.all([
      delegate.count({ where: scopeWhere }),
      delegate.count({ where: { ...scopeWhere, createdAt: { gte: windowStart } } }),
      delegate.count({
        where: { ...scopeWhere, createdAt: { gte: priorStart, lt: windowStart } },
      }),
    ]);

    const changePercent = prior === 0 ? null : Math.round(((recent - prior) / prior) * 100);
    return { total, changePercent };
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

  /**
   * The last ten audit entries this caller may see — never `before`/`after`
   * (a dashboard feed is not an audit-log viewer). A project-scoped entry is
   * shown only when its project is in `visibleProjects`; a portfolio-wide
   * entry (client/proposal/user administration, `projectId` null) is shown
   * only when the caller holds `client:view`/`proposal:view`/`user:view`
   * anywhere, matched against `entityType`.
   */
  private async recentActivity(
    userId: string,
    visibleProjects: string[] | null,
  ): Promise<ActivityItem[]> {
    const [canClients, canProposals, canUsers] = await Promise.all([
      this.authorization.canAnywhere(userId, 'client:view'),
      this.authorization.canAnywhere(userId, 'proposal:view'),
      this.authorization.canAnywhere(userId, 'user:view'),
    ]);

    const globalEntityTypes = [
      ...(canClients ? ['Client'] : []),
      ...(canProposals ? ['Proposal'] : []),
      ...(canUsers ? ['User'] : []),
    ];

    const projectScoped =
      visibleProjects === null
        ? { projectId: { not: null } }
        : { projectId: { in: visibleProjects } };

    const entries = await this.prisma.auditEntry.findMany({
      where: {
        action: { in: [...ACTIVITY_ACTIONS] },
        outcome: 'SUCCEEDED',
        OR: [
          projectScoped,
          ...(globalEntityTypes.length > 0
            ? [{ projectId: null, entityType: { in: globalEntityTypes } }]
            : []),
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 10,
      select: {
        action: true,
        entityType: true,
        entityId: true,
        projectId: true,
        occurredAt: true,
      },
    });

    return entries.map((e) => ({
      action: e.action as ActivityAction,
      entityType: e.entityType,
      entityId: e.entityId,
      projectId: e.projectId,
      occurredAt: e.occurredAt.toISOString(),
    }));
  }

  /**
   * Real, unresolved `Milestone.targetDate`/`Issue.dueDate` rows, nearest
   * first — never the fabricated example dates a mock of this widget would
   * otherwise show. `OVERDUE` is already past; `PENDING` is within three
   * days; anything further out is `UPCOMING`. Each source is scoped and
   * gated exactly as its own module's list endpoint already is
   * (`planning:view` for milestones, `issue:view` for issues) — a caller
   * missing one permission still sees the other's deadlines.
   */
  private async upcomingDeadlines(
    visibleForPlanning: string[] | null,
    visibleForIssues: string[] | null,
  ): Promise<DeadlineItem[]> {
    const now = new Date();

    const milestones =
      visibleForPlanning === null || visibleForPlanning.length > 0
        ? await this.prisma.milestone.findMany({
            where: {
              ...(visibleForPlanning === null ? {} : { projectId: { in: visibleForPlanning } }),
              archivedAt: null,
              achievedDate: null,
              targetDate: { not: null },
            },
            select: { name: true, targetDate: true, projectId: true },
          })
        : [];

    const issues =
      visibleForIssues === null || visibleForIssues.length > 0
        ? await this.prisma.issue.findMany({
            where: {
              ...(visibleForIssues === null ? {} : { projectId: { in: visibleForIssues } }),
              status: { in: ['OPEN', 'IN_PROGRESS'] },
              dueDate: { not: null },
            },
            select: { title: true, dueDate: true, projectId: true },
          })
        : [];

    const items: DeadlineItem[] = [
      ...milestones.map((m) => ({
        date: m.targetDate as Date,
        title: m.name,
        entityType: 'Milestone' as const,
        projectId: m.projectId,
      })),
      ...issues.map((i) => ({
        date: i.dueDate as Date,
        title: i.title,
        entityType: 'Issue' as const,
        projectId: i.projectId,
      })),
    ].map((item) => ({
      ...item,
      date: item.date.toISOString(),
      status: deadlineStatus(item.date, now),
    }));

    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }

  private fillZeros<S extends string>(
    statuses: readonly S[],
    counted: readonly (readonly [string, number])[],
  ): Record<S, number> {
    const counts = new Map(counted);
    return Object.fromEntries(statuses.map((s) => [s, counts.get(s) ?? 0])) as Record<S, number>;
  }
}
