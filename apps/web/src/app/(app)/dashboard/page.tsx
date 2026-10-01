import {
  type ActivityItem,
  type DashboardSummary,
  type DeadlineItem,
  type NotificationItem,
  PROJECT_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  type Trend,
} from '@ecms/contracts';
import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import { DonutChart, Funnel } from '@/components/charts';
import {
  CalendarIcon,
  CheckIcon,
  ClientsIcon,
  DocumentsIcon,
  IssuesIcon,
  ProjectsIcon,
  ProposalsIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/icons';
import { MiniCalendar } from '@/components/mini-calendar';
import { Details, type DetailsContent } from '@/components/popover';
import { Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
import { WorkflowSteps } from '@/components/workflow';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Property } from '@/lib/types';
import {
  ACTIVITY_VERB,
  buildWorkflow,
  plural,
  PROJECT_STATUS_LABEL,
  PROPOSAL_FUNNEL_ORDER,
  PROPOSAL_IN_PROGRESS,
  PROPOSAL_STATUS_LABEL,
  sumOf,
  nextStatuses,
  timeAgo,
} from '@/lib/workflow';

export const metadata = { title: 'Dashboard — ECMS' };

const PROJECT_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--status-draft)',
  ACTIVE: 'var(--status-active)',
  ON_HOLD: 'var(--status-hold)',
  COMPLETED: 'var(--status-complete)',
  CLOSED: 'var(--status-closed)',
};

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

/** The API's own trend — new records in the trailing 30 days against the
 *  30 before — as a popover row. `null` means there was nothing earlier to
 *  compare against, and says so rather than showing a number. */
function trendRows(trend: Trend | undefined): NonNullable<DetailsContent['rows']> {
  if (!trend) return [];
  const label = 'New vs previous 30 days';
  const change = trend.changePercent;
  if (change === null) return [{ label, value: 'No earlier data' }];
  if (change === 0) return [{ label, value: 'No change' }];
  return [
    { label, value: `${change > 0 ? '+' : ''}${change}%`, tone: change > 0 ? 'success' : 'danger' },
  ];
}

function KpiCard({
  icon: Icon,
  value,
  label,
  href,
  accent,
  detail,
  details,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  value: number;
  label: string;
  href: string;
  /** The one supporting figure that stays on the card (e.g. how many are
   *  overdue) — never a derived or estimated figure. */
  detail?: { text: string; tone?: 'danger' } | undefined;
  /** Breakdowns and trend, shown on hover/tap. */
  details: DetailsContent;
  /** One accent per metric identity, not a decorative rainbow — Projects is
   *  blue (the primary/informational colour), Proposals purple (this
   *  system's secondary-workflow colour), Clients green, Issues red. */
  accent?: 'blue' | 'purple' | 'green' | 'red';
}) {
  return (
    <Details
      className="kpi-card"
      content={details}
      triggerLabel={`Breakdown of ${label.toLowerCase()}`}
      triggerClassName="kpi-card__details-trigger"
    >
      <Link href={href} className="kpi-card__link">
        <span className="kpi-card__head">
          <span className="kpi-card__label">{label}</span>
          <span
            className={`kpi-card__icon ${accent && accent !== 'blue' ? `kpi-card__icon--${accent}` : ''}`}
          >
            <Icon width={16} height={16} />
          </span>
        </span>
        <span className="kpi-card__value">{value.toLocaleString()}</span>
        <span className="kpi-card__foot">
          {detail ? (
            <span
              className={`kpi-card__detail ${detail.tone === 'danger' ? 'kpi-card__detail--danger' : ''}`}
            >
              {detail.text}
            </span>
          ) : null}
        </span>
      </Link>
    </Details>
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
  primary = false,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** The create actions that start or move work along the workflow get the
   *  stronger treatment; admin/utility links stay quieter beneath them. */
  primary?: boolean;
}) {
  return (
    <Link href={href} className={`quick-action ${primary ? 'quick-action--primary' : ''}`}>
      <span className="quick-action__icon">
        <Icon width={16} height={16} />
      </span>
      {label}
    </Link>
  );
}

interface AttentionRow {
  key: string;
  item: string;
  context?: string | undefined;
  status: { label: string; className: string };
  due: string | null;
  action: { href: string; label: string };
  /** Type, reason, related record and full date — shown on hover/tap. */
  details: DetailsContent;
}

/** What `DeadlineItem.status` means, per its own contract comment. */
const DEADLINE_REASON: Record<DeadlineItem['status'], string> = {
  OVERDUE: 'The date has passed and it is still open.',
  PENDING: 'Due within the next three days.',
  UPCOMING: 'Due more than three days from now.',
};

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function share(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '—';
}

/** Where a proposal moves forward (PROPOSAL_TRANSITIONS' main line), kept
 *  apart from the two states that step off it — so the funnel reads as a
 *  pipeline, not one undifferentiated list of statuses. */
const PROPOSAL_PIPELINE = ['NEW', 'CONCEPT', 'CLIENT_REVISION', 'APPROVED', 'WON', 'CONVERTED'];
const PROPOSAL_OFF_PIPELINE = ['ON_HOLD', 'LOST'];

/**
 * The signed-in landing page (docs/phase-11-plan.md §8, extended per the
 * enterprise-redesign brief). Every card below is rendered only when the
 * summary carries that key — the API omits a section entirely rather than
 * sending zeros for something this person may not see.
 *
 * Reads top to bottom as: what to do next (workflow + quick actions) → what
 * needs attention → where things stand (KPIs, status, funnel) → detail.
 */
export default async function DashboardPage() {
  const session = await requireSession();

  // The same `/notifications` recompute the standalone page runs
  // (docs/phase-11-plan.md §5), and the properties register's own total —
  // the one prerequisite the summary does not count, read from the list
  // endpoint the Properties page already uses. Nothing new is asked for.
  const [summary, notifications, propertiesTotal] = await Promise.all([
    api.get<DashboardSummary>('/dashboard'),
    api.get<NotificationItem[]>('/notifications').catch(() => [] as NotificationItem[]),
    session.can('property:view')
      ? api
          .get<ApiPage<Property>>('/properties?pageSize=1')
          .then((page) => page.total)
          .catch(() => null)
      : null,
  ]);

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

  const projectCounts = summary.projects as Record<string, number> | undefined;
  const proposalCounts = summary.proposals as Record<string, number> | undefined;

  const projectsTotal = sumOf(projectCounts, Object.keys(PROJECT_STATUS_LABEL));
  const proposalsTotal = sumOf(proposalCounts, PROPOSAL_FUNNEL_ORDER);
  const proposalsInProgress = sumOf(proposalCounts, PROPOSAL_IN_PROGRESS);

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

  const { steps, nextSummary, wonAwaiting, activeProjects, readyToClose } = buildWorkflow(
    session,
    summary,
    propertiesTotal,
  );

  /* Needs attention ----------------------------------------------------------
   * Only things the summary already flags — dated items that are overdue or
   * due within three days, and hand-offs the workflow above is waiting on. */
  const attentionRows: AttentionRow[] = [
    ...[...(summary.upcomingDeadlines ?? [])]
      .filter((item) => item.status !== 'UPCOMING')
      .sort(
        (a, b) =>
          (a.status === 'OVERDUE' ? 0 : 1) - (b.status === 'OVERDUE' ? 0 : 1) ||
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      .slice(0, 6)
      .map((item, index) => ({
        key: `deadline-${index}`,
        item: item.title,
        context: projectNameById.get(item.projectId),
        status: {
          label: DEADLINE_LABEL[item.status],
          className: DEADLINE_BADGE_CLASS[item.status],
        },
        due: item.date,
        action: { href: `/projects/${item.projectId}`, label: 'Open' },
        details: {
          title: item.title,
          rows: [
            { label: 'Type', value: item.entityType },
            {
              label: 'Due',
              value: formatLongDate(item.date),
              tone: item.status === 'OVERDUE' ? ('danger' as const) : undefined,
            },
            ...(projectNameById.has(item.projectId)
              ? [{ label: 'Project', value: projectNameById.get(item.projectId) ?? '' }]
              : []),
          ],
          notes: [{ label: 'Why it is here', text: DEADLINE_REASON[item.status] }],
          link: { href: `/projects/${item.projectId}`, label: 'Open project' },
        },
      })),
    ...(wonAwaiting > 0
      ? [
          {
            key: 'won',
            item: `${plural(wonAwaiting, 'won proposal')} awaiting conversion`,
            status: { label: 'Won', className: 'badge--success' },
            due: null,
            action: { href: '/proposals?status=WON', label: 'Review' },
            details: {
              title: 'Won proposals awaiting conversion',
              rows: [
                { label: 'Type', value: 'Proposal' },
                { label: 'Waiting', value: wonAwaiting.toLocaleString() },
              ],
              notes: [
                {
                  label: 'Why it is here',
                  text: 'A won proposal only becomes a project once someone converts it.',
                },
                { label: 'Needs', text: 'A property attached to each proposal.' },
              ],
            },
          },
        ]
      : []),
    ...(readyToClose > 0
      ? [
          {
            key: 'handover',
            item: `${plural(readyToClose, 'completed project')} ready to close`,
            status: { label: 'Ready to close', className: 'badge--info' },
            due: null,
            action: { href: '/projects?status=COMPLETED', label: 'Review' },
            details: {
              title: 'Projects ready to close',
              rows: [
                { label: 'Type', value: 'Project' },
                { label: 'Ready', value: readyToClose.toLocaleString() },
                {
                  label: 'Completed, not closed',
                  value: (summary.handover?.completedNotClosed ?? 0).toLocaleString(),
                },
              ],
              notes: [
                {
                  label: 'Why it is here',
                  text: 'Every handover precondition is met — only the close itself remains.',
                },
              ],
            },
          },
        ]
      : []),
    ...(summary.supervisionAgreements && summary.supervisionAgreements.nearingQuota > 0
      ? [
          {
            key: 'quota',
            item: `${plural(summary.supervisionAgreements.nearingQuota, 'supervision agreement')} nearing quota`,
            status: { label: 'Nearing quota', className: 'badge--warning' },
            due: null,
            action: { href: '/supervision', label: 'Open' },
            details: {
              title: 'Supervision agreements nearing quota',
              rows: [
                { label: 'Type', value: 'Supervision agreement' },
                {
                  label: 'Nearing quota',
                  value: summary.supervisionAgreements.nearingQuota.toLocaleString(),
                },
                { label: 'Active', value: summary.supervisionAgreements.active.toLocaleString() },
              ],
              notes: [
                {
                  label: 'Why it is here',
                  text: 'These agreements have used most of their agreed site visits.',
                },
              ],
            },
          },
        ]
      : []),
  ];

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

  const proposalStageDetails = (status: string): DetailsContent => {
    const label = PROPOSAL_STATUS_LABEL[status] ?? status;
    const value = proposalCounts?.[status] ?? 0;
    return {
      title: `${label} proposals`,
      rows: [
        { label: 'Proposals', value: value.toLocaleString() },
        { label: 'Share of all proposals', value: share(value, proposalsTotal) },
      ],
      notes: [
        {
          label: 'Moves on to',
          text:
            status === 'WON'
              ? 'Converted — by converting it to a project.'
              : (nextStatuses(PROPOSAL_TRANSITIONS, PROPOSAL_STATUS_LABEL, status) ??
                'Nothing — this is a final stage.'),
        },
      ],
      link: { href: `/proposals?status=${status}`, label: `View ${label.toLowerCase()} proposals` },
    };
  };

  const primaryActions = [
    session.can('proposal:create')
      ? { href: '/proposals/new', icon: ProposalsIcon, label: 'New proposal' }
      : null,
    session.can('project:create')
      ? { href: '/projects/new', icon: ProjectsIcon, label: 'New project' }
      : null,
    session.can('client:create')
      ? { href: '/clients/new', icon: ClientsIcon, label: 'New client' }
      : null,
  ].filter((action) => action !== null);
  const secondaryActions = [
    session.can('document:create')
      ? { href: '/projects', icon: DocumentsIcon, label: 'Upload document' }
      : null,
    session.can('user:view') ? { href: '/users', icon: UsersIcon, label: 'Manage users' } : null,
    { href: '/settings', icon: SettingsIcon, label: 'System settings' },
  ].filter((action) => action !== null);

  return (
    <>
      <PageHead title="Dashboard" description={`${greeting}, ${firstName}. ${heroMessage}`}>
        <div className="page-head__date">
          <CalendarIcon width={16} height={16} />
          <time dateTime={new Date().toISOString().slice(0, 10)}>{today}</time>
        </div>
      </PageHead>

      {!hasAnything ? (
        <Card>
          <CardBody>
            <Empty title="Nothing to show yet">
              You do not currently hold a role with a view permission on any register.
            </Empty>
          </CardBody>
        </Card>
      ) : (
        <div className="dashboard">
          <section className="card workflow-card" aria-labelledby="workflow-title">
            <header className="workflow-card__head">
              <div>
                <h2 id="workflow-title">Your next step</h2>
                {nextSummary ? <p>{nextSummary}</p> : null}
              </div>
              <Link href="/workflow" className="workflow-card__more">
                View full workflow <span aria-hidden="true">→</span>
              </Link>
            </header>
            <div className="card__body">
              <WorkflowSteps steps={steps} />
            </div>
          </section>

          <div className="grid-2">
            <Card>
              <CardHead title="Needs attention">
                {attentionRows.length > 0 ? (
                  <span className="count-pill">{attentionRows.length}</span>
                ) : null}
              </CardHead>
              {attentionRows.length > 0 ? (
                <table className="attention-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionRows.map((row) => (
                      <tr key={row.key}>
                        <td className="attention-table__item">
                          <Details trigger="area" content={row.details}>
                            <strong>{row.item}</strong>
                            {row.context ? <span>{row.context}</span> : null}
                          </Details>
                        </td>
                        <td data-label="Status">
                          <span className={`badge ${row.status.className}`}>
                            {row.status.label}
                          </span>
                        </td>
                        <td data-label="Due" className="nowrap">
                          {row.due ? formatDeadlineDate(row.due) : <span className="faint">—</span>}
                        </td>
                        <td className="right attention-table__action">
                          <Link
                            href={row.action.href}
                            className="button button--secondary button--small"
                          >
                            {row.action.label}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <CardBody>
                  <div className="all-clear">
                    <span className="all-clear__icon">
                      <CheckIcon width={16} height={16} />
                    </span>
                    <div>
                      <strong>Nothing needs attention</strong>
                      <span>No overdue or imminent deadlines, and no hand-offs waiting.</span>
                    </div>
                  </div>
                </CardBody>
              )}
            </Card>

            <Card>
              <CardHead title="Quick actions" />
              <CardBody>
                {primaryActions.length > 0 ? (
                  <div className="quick-actions quick-actions--primary">
                    {primaryActions.map((action) => (
                      <QuickAction key={action.href} {...action} primary />
                    ))}
                  </div>
                ) : null}
                <div className="quick-actions">
                  {secondaryActions.map((action) => (
                    <QuickAction key={action.label} {...action} />
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="kpi-grid">
            {summary.projects ? (
              <KpiCard
                icon={ProjectsIcon}
                value={projectsTotal}
                label="Total projects"
                href="/projects"
                accent="blue"
                detail={{ text: `${activeProjects.toLocaleString()} active` }}
                details={{
                  title: 'Projects by status',
                  rows: [
                    ...Object.entries(PROJECT_STATUS_LABEL).map(([status, label]) => ({
                      label,
                      value: (projectCounts?.[status] ?? 0).toLocaleString(),
                    })),
                    ...(summary.projects.byType
                      ? [
                          {
                            label: 'With planning',
                            value: summary.projects.byType.planning.toLocaleString(),
                          },
                          {
                            label: 'With supervision',
                            value: summary.projects.byType.supervision.toLocaleString(),
                          },
                        ]
                      : []),
                    ...trendRows(summary.projects.trend),
                  ],
                  notes: [
                    {
                      label: 'Note',
                      text: 'A planning-and-supervision project counts towards both.',
                    },
                  ],
                  link: { href: '/projects', label: 'View all projects' },
                }}
              />
            ) : null}
            {summary.proposals ? (
              <KpiCard
                icon={ProposalsIcon}
                value={proposalsTotal}
                label="Total proposals"
                href="/proposals"
                accent="purple"
                detail={{ text: `${proposalsInProgress.toLocaleString()} in progress` }}
                details={{
                  title: 'Proposals at a glance',
                  rows: [
                    { label: 'In progress', value: proposalsInProgress.toLocaleString() },
                    { label: 'Won, awaiting conversion', value: wonAwaiting.toLocaleString() },
                    {
                      label: 'Converted',
                      value: (proposalCounts?.CONVERTED ?? 0).toLocaleString(),
                    },
                    { label: 'On hold', value: (proposalCounts?.ON_HOLD ?? 0).toLocaleString() },
                    { label: 'Lost', value: (proposalCounts?.LOST ?? 0).toLocaleString() },
                    ...trendRows(summary.proposals.trend),
                  ],
                  link: { href: '/proposals', label: 'View all proposals' },
                }}
              />
            ) : null}
            {summary.clients ? (
              <KpiCard
                icon={ClientsIcon}
                value={summary.clients.total}
                label="Total clients"
                href="/clients"
                accent="green"
                details={{
                  title: 'Clients',
                  rows: [
                    { label: 'Clients', value: summary.clients.total.toLocaleString() },
                    ...(propertiesTotal !== null
                      ? [{ label: 'Properties', value: propertiesTotal.toLocaleString() }]
                      : []),
                    ...trendRows(summary.clients),
                  ],
                  link: { href: '/clients', label: 'View all clients' },
                }}
              />
            ) : null}
            {summary.issues ? (
              <KpiCard
                icon={IssuesIcon}
                value={summary.issues.open}
                label="Open issues"
                href="/projects"
                accent="red"
                detail={
                  summary.issues.overdue > 0
                    ? { text: `${summary.issues.overdue.toLocaleString()} overdue`, tone: 'danger' }
                    : { text: 'None overdue' }
                }
                details={{
                  title: 'Issues',
                  rows: [
                    { label: 'Open', value: summary.issues.open.toLocaleString() },
                    {
                      label: 'Overdue',
                      value: summary.issues.overdue.toLocaleString(),
                      tone: summary.issues.overdue > 0 ? 'danger' : undefined,
                    },
                    { label: 'Closed', value: summary.issues.closed.toLocaleString() },
                    ...(summary.issues.byWorkstream
                      ? [
                          {
                            label: 'Open on planning',
                            value: summary.issues.byWorkstream.planning.toLocaleString(),
                          },
                          {
                            label: 'Open on supervision',
                            value: summary.issues.byWorkstream.supervision.toLocaleString(),
                          },
                        ]
                      : []),
                  ],
                  notes: summary.issues.byWorkstream
                    ? [
                        {
                          label: 'Note',
                          text: 'An untagged issue on a planning-and-supervision project counts only in Open.',
                        },
                      ]
                    : undefined,
                }}
              />
            ) : null}
          </div>

          {summary.projects || summary.proposals ? (
            <div className="grid-2 grid-2--even">
              {summary.projects ? (
                <Card>
                  <CardHead title="Project status">
                    <Link href="/projects" className="button button--secondary button--small">
                      View all
                    </Link>
                  </CardHead>
                  <CardBody>
                    {projectsTotal > 0 ? (
                      <DonutChart
                        segments={Object.entries(PROJECT_STATUS_LABEL).map(([status, label]) => ({
                          label,
                          value: projectCounts?.[status] ?? 0,
                          color: PROJECT_STATUS_COLOR[status] ?? 'var(--slate-400)',
                          details: {
                            title: `${label} projects`,
                            rows: [
                              {
                                label: 'Projects',
                                value: (projectCounts?.[status] ?? 0).toLocaleString(),
                              },
                              {
                                label: 'Share of all projects',
                                value: share(projectCounts?.[status] ?? 0, projectsTotal),
                              },
                            ],
                            notes: [
                              {
                                label: 'Moves on to',
                                text:
                                  nextStatuses(PROJECT_TRANSITIONS, PROJECT_STATUS_LABEL, status) ??
                                  'Nothing — a closed project accepts no further change.',
                              },
                            ],
                            link: {
                              href: `/projects?status=${status}`,
                              label: `View ${label.toLowerCase()} projects`,
                            },
                          },
                        }))}
                      />
                    ) : (
                      <Empty title="No projects yet">
                        <p>A project is created by converting a won proposal, or directly.</p>
                        {session.can('project:create') ? (
                          <Link href="/projects/new" className="button button--small">
                            New project
                          </Link>
                        ) : null}
                      </Empty>
                    )}
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
                    {proposalsTotal > 0 ? (
                      <>
                        <Funnel
                          stages={PROPOSAL_PIPELINE.map((status) => ({
                            label: PROPOSAL_STATUS_LABEL[status] ?? status,
                            value: proposalCounts?.[status] ?? 0,
                            color: PROPOSAL_STAGE_COLOR[status],
                            details: proposalStageDetails(status),
                          }))}
                        />
                        <h3 className="funnel-divider">Off the pipeline</h3>
                        <Funnel
                          stages={PROPOSAL_OFF_PIPELINE.map((status) => ({
                            label: PROPOSAL_STATUS_LABEL[status] ?? status,
                            value: proposalCounts?.[status] ?? 0,
                            color: PROPOSAL_STAGE_COLOR[status],
                            details: proposalStageDetails(status),
                          }))}
                        />
                      </>
                    ) : (
                      <Empty title="No proposals yet">
                        <p>Work starts with a proposal — no client or property needed yet.</p>
                        {session.can('proposal:create') ? (
                          <Link href="/proposals/new" className="button button--small">
                            New proposal
                          </Link>
                        ) : null}
                      </Empty>
                    )}
                  </CardBody>
                </Card>
              ) : null}
            </div>
          ) : null}

          {/* Two independent-height columns, left for delivery-status cards, right
              for a shorter utility rail (calendar/notifications/deadlines) — kept
              close in height on purpose so neither column trails off into a long
              empty gap below the other. */}
          <div className="grid-2">
            <div className="stack">
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
          ) : null}
        </div>
      )}
    </>
  );
}
