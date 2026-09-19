import type {
  ActivityItem,
  DashboardSummary,
  DeadlineItem,
  NotificationItem,
  Trend,
} from '@ecms/contracts';
import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import { DonutChart, Funnel } from '@/components/charts';
import {
  ClientsIcon,
  DocumentsIcon,
  IssuesIcon,
  ProjectsIcon,
  ProposalsIcon,
  SettingsIcon,
  TrendDownIcon,
  TrendUpIcon,
  UsersIcon,
} from '@/components/icons';
import { MiniCalendar } from '@/components/mini-calendar';
import { Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Dashboard — ECMS' };

const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

const PROJECT_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--status-draft)',
  ACTIVE: 'var(--status-active)',
  ON_HOLD: 'var(--status-hold)',
  COMPLETED: 'var(--status-complete)',
  CLOSED: 'var(--status-closed)',
};

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONCEPT: 'Concept',
  CLIENT_REVISION: 'Client revision',
  APPROVED: 'Approved',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  CONVERTED: 'Converted',
};

const PROPOSAL_FUNNEL_ORDER = [
  'NEW',
  'CONCEPT',
  'CLIENT_REVISION',
  'APPROVED',
  'WON',
  'LOST',
  'ON_HOLD',
  'CONVERTED',
];

/** New/Concept are the same "in progress" blue family (concept a lighter
 *  tint); Approved/Won are both success-green; Lost is the one failure state
 *  in this funnel; Client revision/On hold are both waiting-on-someone
 *  amber; Converted — a proposal becoming a real project — gets the
 *  secondary-workflow purple, since it is the one stage that hands off to a
 *  different module entirely. */
const PROPOSAL_STAGE_COLOR: Record<string, string> = {
  NEW: 'var(--brand-700)',
  CONCEPT: '#7fb2f0',
  CLIENT_REVISION: 'var(--warning)',
  APPROVED: 'var(--success)',
  WON: 'var(--success)',
  LOST: 'var(--danger)',
  ON_HOLD: 'var(--warning)',
  CONVERTED: 'var(--purple)',
};

const ACTIVITY_VERB: Record<ActivityItem['action'], string> = {
  CREATED: 'created',
  UPDATED: 'updated',
  ARCHIVED: 'archived',
  RESTORED: 'restored',
  STATUS_CHANGED: 'changed the status of',
  MEMBER_ADDED: 'added a member to',
  MEMBER_REMOVED: 'removed a member from',
};

/** One accent per entity family, the same identity the KPI cards and
 *  status system use elsewhere — a client is always blue, a proposal
 *  always purple, wherever either appears. Anything outside this named set
 *  (Document, Milestone, ...) gets the neutral default rather than a guess. */
const ACTIVITY_ACCENT: Record<
  string,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; class: string }
> = {
  Client: { icon: ClientsIcon, class: 'activity-icon--blue' },
  Proposal: { icon: ProposalsIcon, class: 'activity-icon--purple' },
  Project: { icon: ProjectsIcon, class: 'activity-icon--green' },
  Issue: { icon: IssuesIcon, class: 'activity-icon--red' },
};
const DEFAULT_ACTIVITY_ACCENT = { icon: DocumentsIcon, class: 'activity-icon--gray' };

function ActivityIcon({ entityType }: { entityType: string }) {
  const { icon: Icon, class: className } = ACTIVITY_ACCENT[entityType] ?? DEFAULT_ACTIVITY_ACCENT;
  return (
    <span className={`activity-icon ${className}`}>
      <Icon width={14} height={14} />
    </span>
  );
}

function TrendTag({ trend }: { trend: Trend | undefined }) {
  if (!trend || trend.changePercent === null) return null;
  const { changePercent } = trend;
  if (changePercent === 0) {
    return <span className="trend trend--flat">No change</span>;
  }
  const up = changePercent > 0;
  const Icon = up ? TrendUpIcon : TrendDownIcon;
  return (
    <span className={`trend ${up ? 'trend--up' : 'trend--down'}`}>
      <Icon width={12} height={12} />
      {up ? '+' : ''}
      {changePercent}%
    </span>
  );
}

function KpiCard({
  icon: Icon,
  value,
  label,
  trend,
  href,
  accent,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  value: number;
  label: string;
  trend?: Trend | undefined;
  href: string;
  /** One accent per metric identity, not a decorative rainbow — Projects is
   *  blue (the primary/informational colour), Proposals purple (this
   *  system's secondary-workflow colour), Clients green, Issues red. */
  accent?: 'blue' | 'purple' | 'green' | 'red';
}) {
  return (
    <Link href={href} className="kpi-card">
      <div className="kpi-card__head">
        <span
          className={`kpi-card__icon ${accent && accent !== 'blue' ? `kpi-card__icon--${accent}` : ''}`}
        >
          <Icon width={18} height={18} />
        </span>
        <TrendTag trend={trend} />
      </div>
      <span className="kpi-card__value">{value.toLocaleString()}</span>
      <span className="kpi-card__label">{label}</span>
    </Link>
  );
}

function activityLabel(item: ActivityItem): ReactNode {
  return (
    <>
      <strong>{item.actorName ?? 'Someone'}</strong> {ACTIVITY_VERB[item.action]} a{' '}
      <strong>{item.entityType}</strong>
      {item.projectCode ? (
        <>
          {' '}
          on{' '}
          <Link href={`/projects/${item.projectId}`}>
            {item.projectCode}
            {item.projectName ? ` — ${item.projectName}` : ''}
          </Link>
        </>
      ) : null}
      {item.clientName ? (
        <>
          {' '}
          <span className="activity-list__client">({item.clientName})</span>
        </>
      ) : null}
    </>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const DEADLINE_BADGE_CLASS: Record<DeadlineItem['status'], string> = {
  OVERDUE: 'badge--critical',
  PENDING: 'badge--warning',
  UPCOMING: 'badge--info',
};
const DEADLINE_LABEL: Record<DeadlineItem['status'], string> = {
  OVERDUE: 'Overdue',
  PENDING: 'Pending',
  UPCOMING: 'Upcoming',
};

function formatDeadlineDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}) {
  return (
    <Link href={href} className="quick-action">
      <Icon width={18} height={18} />
      {label}
    </Link>
  );
}

/**
 * The signed-in landing page (docs/phase-11-plan.md §8, extended per the
 * enterprise-redesign brief). Every card below is rendered only when the
 * summary carries that key — the API omits a section entirely rather than
 * sending zeros for something this person may not see.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const summary = await api.get<DashboardSummary>('/dashboard');

  // The same `/notifications` recompute the standalone page runs
  // (docs/phase-11-plan.md §5) — nothing new fetched, just also surfaced
  // here so the utility rail does not send someone away to see it.
  const notifications = await api
    .get<NotificationItem[]>('/notifications')
    .catch(() => [] as NotificationItem[]);

  const hasAnything =
    summary.projects ||
    summary.proposals ||
    summary.clients ||
    summary.issues ||
    summary.supervisionAgreements ||
    summary.handover;

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const projectsTotal = summary.projects
    ? Object.entries(summary.projects)
        .filter(([key]) => key !== 'trend')
        .reduce((sum, [, count]) => sum + (typeof count === 'number' ? count : 0), 0)
    : 0;
  const proposalsTotal = summary.proposals
    ? Object.entries(summary.proposals)
        .filter(([key]) => key !== 'trend')
        .reduce((sum, [, count]) => sum + (typeof count === 'number' ? count : 0), 0)
    : 0;

  const firstName = session.user.displayName.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const overdueIssues = summary.issues?.overdue ?? 0;
  const overdueDeadlines =
    summary.upcomingDeadlines?.filter((item) => item.status === 'OVERDUE').length ?? 0;
  const overdueTotal = overdueIssues + overdueDeadlines;
  const heroMessage =
    overdueTotal > 0
      ? `${overdueTotal} item${overdueTotal === 1 ? '' : 's'} across the portfolio ${overdueTotal === 1 ? 'is' : 'are'} overdue and need attention.`
      : 'Nothing overdue right now — the portfolio is on track.';

  // Neither `DeadlineItem` nor `ActivityItem` alone carries everything a
  // "project-wise" row wants (a deadline has no project name; an activity
  // entry has no deadline) — this only joins the two the API already sent,
  // it never asks for anything new. A project with no activity entry to
  // borrow a name from still gets a row, just without one.
  const projectNameById = new Map<string, string>();
  for (const item of summary.recentActivity ?? []) {
    if (item.projectId && item.projectCode) {
      projectNameById.set(
        item.projectId,
        item.projectName ? `${item.projectCode} — ${item.projectName}` : item.projectCode,
      );
    }
  }
  const nextDeadlineByProject = new Map<string, DeadlineItem>();
  for (const item of [...(summary.upcomingDeadlines ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )) {
    if (!nextDeadlineByProject.has(item.projectId)) {
      nextDeadlineByProject.set(item.projectId, item);
    }
  }
  const projectDeadlineRows = [...nextDeadlineByProject.entries()].map(([projectId, deadline]) => ({
    projectId,
    label: projectNameById.get(projectId) ?? `Project ${projectId.slice(0, 8)}`,
    deadline,
  }));

  // A data-supported split, not an invented taxonomy: `entityType` already
  // separates delivery work (Project/Issue) from client-facing/sales work
  // (Client/Proposal) — the same two families `ACTIVITY_ACCENT` already
  // colours differently above.
  const DELIVERY_TYPES = new Set(['Project', 'Issue']);
  const deliveryActivity = (summary.recentActivity ?? []).filter((item) =>
    DELIVERY_TYPES.has(item.entityType),
  );
  const clientActivity = (summary.recentActivity ?? []).filter(
    (item) => !DELIVERY_TYPES.has(item.entityType),
  );

  const NOTIFICATION_DOT_CLASS: Record<NotificationItem['severity'], string> = {
    INFO: 'notification-mini-list__dot--info',
    WARNING: 'notification-mini-list__dot--warning',
    CRITICAL: 'notification-mini-list__dot--critical',
  };

  return (
    <>
      <PageHead
        title="Dashboard"
        description="Here's what's happening with your consultancy portfolio today."
      />

      {!hasAnything ? (
        <Card>
          <CardBody>
            <Empty title="Nothing to show yet">
              You do not currently hold a role with a view permission on any register.
            </Empty>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="hero-banner">
            <div>
              <h2>
                {greeting}, {firstName}.
              </h2>
              <p>{heroMessage}</p>
            </div>
            <div className="hero-banner__date">
              <span>Today</span>
              <strong>{today}</strong>
            </div>
          </div>

          <div className="kpi-grid" style={{ marginBottom: 'var(--space-5)' }}>
            {summary.projects ? (
              <KpiCard
                icon={ProjectsIcon}
                value={projectsTotal}
                label="Total projects"
                trend={summary.projects.trend}
                href="/projects"
                accent="blue"
              />
            ) : null}
            {summary.proposals ? (
              <KpiCard
                icon={ProposalsIcon}
                value={proposalsTotal}
                label="Total proposals"
                trend={summary.proposals.trend}
                href="/proposals"
                accent="purple"
              />
            ) : null}
            {summary.clients ? (
              <KpiCard
                icon={ClientsIcon}
                value={summary.clients.total}
                label="Total clients"
                trend={summary.clients}
                href="/clients"
                accent="green"
              />
            ) : null}
            {summary.issues ? (
              <KpiCard
                icon={IssuesIcon}
                value={summary.issues.open}
                label="Open issues"
                href="/projects"
                accent="red"
              />
            ) : null}
          </div>

          <Card>
            <CardHead title="Quick actions" />
            <CardBody>
              <div className="quick-actions">
                {session.can('project:create') ? (
                  <QuickAction href="/projects/new" icon={ProjectsIcon} label="New project" />
                ) : null}
                {session.can('proposal:create') ? (
                  <QuickAction href="/proposals/new" icon={ProposalsIcon} label="New proposal" />
                ) : null}
                {session.can('client:create') ? (
                  <QuickAction href="/clients/new" icon={ClientsIcon} label="New client" />
                ) : null}
                {session.can('document:create') ? (
                  <QuickAction href="/projects" icon={DocumentsIcon} label="Upload document" />
                ) : null}
                {session.can('user:view') ? (
                  <QuickAction href="/users" icon={UsersIcon} label="Manage users" />
                ) : null}
                <QuickAction href="/settings" icon={SettingsIcon} label="System settings" />
              </div>
            </CardBody>
          </Card>

          {summary.projects || summary.proposals ? (
            <div className="grid-2" style={{ marginTop: 'var(--space-5)' }}>
              {summary.projects ? (
                <Card>
                  <CardHead title="Project status" />
                  <CardBody>
                    <DonutChart
                      segments={Object.entries(PROJECT_STATUS_LABEL).map(([status, label]) => ({
                        label,
                        value: (summary.projects as Record<string, number>)[status] ?? 0,
                        color: PROJECT_STATUS_COLOR[status] ?? 'var(--slate-400)',
                      }))}
                    />
                  </CardBody>
                </Card>
              ) : null}

              {summary.proposals ? (
                <Card>
                  <CardHead title="Proposal funnel">
                    <Link href="/proposals" className="button button--secondary button--small">
                      View all
                    </Link>
                  </CardHead>
                  <CardBody>
                    <Funnel
                      stages={PROPOSAL_FUNNEL_ORDER.map((status) => ({
                        label: PROPOSAL_STATUS_LABEL[status] ?? status,
                        value: (summary.proposals as Record<string, number>)[status] ?? 0,
                        color: PROPOSAL_STAGE_COLOR[status],
                      }))}
                    />
                  </CardBody>
                </Card>
              ) : null}
            </div>
          ) : null}

          {/* Two independent-height columns, left for delivery-status cards, right
              for a shorter utility rail (calendar/notifications/deadlines) — kept
              close in height on purpose so neither column trails off into a long
              empty gap below the other. The two naturally tallest cards (the
              chart pair above, and Recent activity below) are full-width instead
              of forced into one of these columns. */}
          <div className="grid-2" style={{ marginTop: 'var(--space-5)' }}>
            <div className="stack">
              {projectDeadlineRows.length > 0 ? (
                <Card>
                  <CardHead title="Projects with upcoming deadlines" />
                  <CardBody>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Deadline status</th>
                            <th>Next deadline</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectDeadlineRows.map((row) => (
                            <tr key={row.projectId}>
                              <td>
                                <Link href={`/projects/${row.projectId}`}>{row.label}</Link>
                              </td>
                              <td>
                                <span className={`badge ${DEADLINE_BADGE_CLASS[row.deadline.status]}`}>
                                  {DEADLINE_LABEL[row.deadline.status]}
                                </span>
                              </td>
                              <td>{formatDeadlineDate(row.deadline.date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {summary.issues ? (
                <Card>
                  <CardHead title="Issues overview" />
                  <CardBody>
                    <div className="stat-grid">
                      <div className="stat">
                        <span className="stat__value stat__value--blue">{summary.issues.open}</span>
                        <span className="stat__label">Open</span>
                      </div>
                      <div className="stat">
                        <span className="stat__value stat__value--green">
                          {summary.issues.closed}
                        </span>
                        <span className="stat__label">Closed</span>
                      </div>
                      <div className="stat">
                        <span className="stat__value stat__value--red">
                          {summary.issues.overdue}
                        </span>
                        <span className="stat__label">Overdue</span>
                      </div>
                    </div>

                    {summary.issues.overdue > 0 ? (
                      <div className="alert-row">
                        <IssuesIcon width={16} height={16} />
                        <strong>{summary.issues.overdue}</strong> issue
                        {summary.issues.overdue === 1 ? ' is' : 's are'} overdue and need attention.
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              ) : null}

              {summary.supervisionAgreements ? (
                <Card>
                  <CardHead title="Supervision agreements" />
                  <CardBody>
                    <div className="stat-grid">
                      <div className="stat">
                        <span className="stat__value">{summary.supervisionAgreements.active}</span>
                        <span className="stat__label">Active</span>
                      </div>
                      <div className="stat">
                        <span className="stat__value">
                          {summary.supervisionAgreements.nearingQuota}
                        </span>
                        <span className="stat__label">Nearing quota</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {summary.handover ? (
                <Card>
                  <CardHead title="Handover" />
                  <CardBody>
                    <div className="stat-grid">
                      <div className="stat">
                        <span className="stat__value">{summary.handover.completedNotClosed}</span>
                        <span className="stat__label">Completed, not closed</span>
                      </div>
                      <div className="stat">
                        <span className="stat__value">{summary.handover.ready}</span>
                        <span className="stat__label">Ready to close</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </div>

            <div className="stack">
              {summary.upcomingDeadlines && summary.upcomingDeadlines.length > 0 ? (
                <Card>
                  <CardHead title="This month" />
                  <CardBody>
                    <MiniCalendar dates={summary.upcomingDeadlines} />
                    <div className="mini-calendar__legend">
                      <span>
                        <i style={{ background: 'var(--danger)' }} />
                        Overdue
                      </span>
                      <span>
                        <i style={{ background: 'var(--warning)' }} />
                        Pending
                      </span>
                      <span>
                        <i style={{ background: 'var(--info)' }} />
                        Upcoming
                      </span>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {notifications.length > 0 ? (
                <Card>
                  <CardHead title="Notifications">
                    <Link href="/notifications" className="button button--secondary button--small">
                      View all
                    </Link>
                  </CardHead>
                  <CardBody>
                    <ul className="notification-mini-list">
                      {notifications.slice(0, 4).map((item, index) => (
                        <li key={index}>
                          <span
                            className={`notification-mini-list__dot ${NOTIFICATION_DOT_CLASS[item.severity]}`}
                          />
                          {item.link ? (
                            <Link href={item.link}>{item.message}</Link>
                          ) : (
                            <span>{item.message}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              {summary.upcomingDeadlines && summary.upcomingDeadlines.length > 0 ? (
                <Card>
                  <CardHead title="Upcoming deadlines" />
                  <CardBody>
                    <ul className="deadline-list">
                      {summary.upcomingDeadlines.map((item, index) => (
                        <li key={index}>
                          <span className="deadline-list__date">
                            {formatDeadlineDate(item.date).toUpperCase()}
                          </span>
                          <span className="deadline-list__text">
                            <Link href={`/projects/${item.projectId}`}>{item.title}</Link>
                          </span>
                          <span className={`badge ${DEADLINE_BADGE_CLASS[item.status]}`}>
                            {DEADLINE_LABEL[item.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

            </div>
          </div>

          {summary.recentActivity && summary.recentActivity.length > 0 ? (
            <div style={{ marginTop: 'var(--space-5)' }}>
            <Card>
              <CardHead title="Recent activity" />
              <CardBody>
                <div className="activity-columns">
                  <div className="activity-column">
                    <h3 className="activity-column__head">Delivery (projects &amp; issues)</h3>
                    {deliveryActivity.length > 0 ? (
                      <ul className="activity-list">
                        {deliveryActivity.map((item, index) => (
                          <li key={index}>
                            <ActivityIcon entityType={item.entityType} />
                            <span className="activity-list__text">{activityLabel(item)}</span>
                            <span className="activity-list__time">{timeAgo(item.occurredAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted" style={{ fontSize: 13 }}>
                        Nothing yet.
                      </p>
                    )}
                  </div>

                  <div className="activity-column">
                    <h3 className="activity-column__head">Clients &amp; proposals</h3>
                    {clientActivity.length > 0 ? (
                      <ul className="activity-list">
                        {clientActivity.map((item, index) => (
                          <li key={index}>
                            <ActivityIcon entityType={item.entityType} />
                            <span className="activity-list__text">{activityLabel(item)}</span>
                            <span className="activity-list__time">{timeAgo(item.occurredAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted" style={{ fontSize: 13 }}>
                        Nothing yet.
                      </p>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
