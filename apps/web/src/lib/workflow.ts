import type { ActivityItem, DashboardSummary } from '@ecms/contracts';

import {
  ApprovalsIcon,
  ClientsIcon,
  PlanningIcon,
  ProjectsIcon,
  ProposalsIcon,
} from '@/components/icons';
import type { WorkflowStep } from '@/components/workflow';
import type { Session } from '@/lib/session';

/*
 * The workflow's state, shared by the dashboard's "Your next step" and the
 * full workflow page, so both always agree. A pure function of data the
 * dashboard summary (and the properties list total) already carries —
 * nothing is fetched here.
 */

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONCEPT: 'Concept',
  CLIENT_REVISION: 'Client revision',
  APPROVED: 'Approved',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  CONVERTED: 'Converted',
};

export const PROPOSAL_FUNNEL_ORDER = [
  'NEW',
  'CONCEPT',
  'CLIENT_REVISION',
  'APPROVED',
  'WON',
  'LOST',
  'ON_HOLD',
  'CONVERTED',
];

export const ACTIVITY_VERB: Record<ActivityItem['action'], string> = {
  CREATED: 'created',
  UPDATED: 'updated',
  ARCHIVED: 'archived',
  RESTORED: 'restored',
  STATUS_CHANGED: 'changed the status of',
  MEMBER_ADDED: 'added a member to',
  MEMBER_REMOVED: 'removed a member from',
};

/** Still moving through the pipeline — not yet won, lost, parked or converted. */
export const PROPOSAL_IN_PROGRESS = ['NEW', 'CONCEPT', 'CLIENT_REVISION', 'APPROVED'];

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** Where a status can go next, read from the shared transition tables — the
 *  same ones the detail pages use to decide which actions to offer. */
export function nextStatuses(
  transitions: Record<string, readonly string[]>,
  labels: Record<string, string>,
  status: string,
): string | undefined {
  const next = transitions[status] ?? [];
  return next.length > 0 ? next.map((to) => labels[to] ?? to).join(', ') : undefined;
}

export function sumOf(counts: Record<string, number> | undefined, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (counts?.[key] ?? 0), 0);
}

export function buildWorkflow(
  session: Session,
  summary: DashboardSummary,
  propertiesTotal: number | null,
) {
  const projectCounts = summary.projects as Record<string, number> | undefined;
  const proposalCounts = summary.proposals as Record<string, number> | undefined;
  const projectsTotal = sumOf(projectCounts, Object.keys(PROJECT_STATUS_LABEL));
  const proposalsTotal = sumOf(proposalCounts, PROPOSAL_FUNNEL_ORDER);
  const proposalsInProgress = sumOf(proposalCounts, PROPOSAL_IN_PROGRESS);

  /* Your next step ------------------------------------------------------------
   *
   * The lifecycle as the forms themselves enforce it, not an assumed one:
   *  1. A proposal can be started with no client or property attached.
   *  2. A property always belongs to a client, and a proposal needs one
   *     before it can be converted — as does creating a project directly.
   *  3. Only a WON proposal converts; a new project opens as a DRAFT.
   *  4. The project's type decides whether it opens planning, supervision
   *     or both workstreams.
   *  5. A COMPLETED project closes once the handover preconditions are met.
   *
   * Every state below comes from a count already on this page. `null` means
   * this person cannot see the register that would decide it, and the step
   * stays neutral rather than guessing. */
  const clientsTotal = summary.clients ? summary.clients.total : null;
  const wonAwaiting = proposalCounts?.WON ?? 0;
  const draftProjects = projectCounts?.DRAFT ?? 0;
  const activeProjects = projectCounts?.ACTIVE ?? 0;
  const readyToClose = summary.handover?.ready ?? 0;
  const deliveryStarted = summary.projects
    ? sumOf(projectCounts, ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED']) > 0
    : null;

  const reached = {
    proposal: summary.proposals ? proposalsTotal > 0 : null,
    registry:
      clientsTotal !== null && propertiesTotal !== null
        ? clientsTotal > 0 && propertiesTotal > 0
        : null,
    project: summary.projects ? projectsTotal > 0 : null,
  };
  const locked = {
    project: propertiesTotal === 0,
    delivery: reached.project === false,
    close: deliveryStarted === false,
  };
  const waiting = {
    project: wonAwaiting > 0 || draftProjects > 0,
    close: readyToClose > 0,
  };

  const registryCta =
    clientsTotal === 0 && session.can('client:create')
      ? { href: '/clients/new', label: 'New client' }
      : propertiesTotal === 0 && session.can('property:create')
        ? { href: '/properties/new', label: 'New property' }
        : session.can('client:view')
          ? { href: '/clients', label: 'View clients' }
          : undefined;

  const projectCta =
    wonAwaiting > 0 && session.can('proposal:convert')
      ? { href: '/proposals?status=WON', label: 'Review won proposals' }
      : draftProjects > 0
        ? { href: '/projects?status=DRAFT', label: 'Review drafts' }
        : session.can('project:create')
          ? { href: '/projects/new', label: 'New project' }
          : { href: '/projects', label: 'View projects' };

  const deliveryCta = session.can('planning:view')
    ? { href: '/planning', label: 'Open planning' }
    : session.can('supervision:view')
      ? { href: '/supervision', label: 'Open supervision' }
      : { href: '/projects', label: 'View projects' };

  // "Last update" is only ever the newest entry already in the activity
  // feed for that step's records — absent when the feed holds none.
  const lastActivity = (types: string[]): string | undefined => {
    const latest = (summary.recentActivity ?? [])
      .filter((item) => types.includes(item.entityType))
      .reduce<ActivityItem | undefined>(
        (newest, item) =>
          !newest || new Date(item.occurredAt) > new Date(newest.occurredAt) ? item : newest,
        undefined,
      );
    return latest
      ? `${timeAgo(latest.occurredAt)} — ${latest.actorName ?? 'Someone'} ${ACTIVITY_VERB[latest.action]} a ${latest.entityType.toLowerCase()}.`
      : undefined;
  };
  const note = (label: string, text: string | undefined) => (text ? [{ label, text }] : []);
  const countRow = (label: string, value: number | undefined, tone?: 'danger' | 'success') =>
    value === undefined ? [] : [{ label, value: value.toLocaleString(), tone }];

  const steps: WorkflowStep[] = [
    {
      key: 'proposal',
      icon: ProposalsIcon,
      title: 'Log proposal',
      state: reached.proposal === null ? 'neutral' : reached.proposal ? 'done' : 'neutral',
      meta: summary.proposals ? `${proposalsInProgress.toLocaleString()} in progress` : undefined,
      cta: session.can('proposal:create')
        ? { href: '/proposals/new', label: 'New proposal' }
        : session.can('proposal:view')
          ? { href: '/proposals', label: 'View proposals' }
          : undefined,
      details: {
        title: 'Step 1 · Log proposal',
        description: 'A sketch number is issued as soon as a proposal is saved.',
        rows: PROPOSAL_IN_PROGRESS.flatMap((status) =>
          countRow(PROPOSAL_STATUS_LABEL[status] ?? status, proposalCounts?.[status]),
        ),
        notes: [
          ...note('Prerequisites', 'None — a client and property can be attached later.'),
          ...note('Last update', lastActivity(['Proposal'])),
          ...note('Next action', 'Create a proposal when new work comes in.'),
        ],
      },
    },
    {
      key: 'registry',
      icon: ClientsIcon,
      title: 'Client & property',
      state: reached.registry ? 'done' : 'neutral',
      meta:
        clientsTotal !== null && propertiesTotal !== null
          ? `${plural(clientsTotal, 'client')} · ${plural(propertiesTotal, 'property', 'properties')}`
          : undefined,
      cta: registryCta,
      details: {
        title: 'Step 2 · Client & property',
        description: 'Every property belongs to a client. A proposal needs a property to convert.',
        rows: [
          ...countRow('Clients', clientsTotal ?? undefined),
          ...countRow('Properties', propertiesTotal ?? undefined),
        ],
        notes: [
          ...note('Prerequisites', 'A property can only be added to an existing client.'),
          ...note('Last update', lastActivity(['Client'])),
          ...note(
            'Next action',
            clientsTotal === 0
              ? 'Register the first client.'
              : propertiesTotal === 0
                ? 'Add a property to a client.'
                : 'Nothing required — add clients and properties as work arrives.',
          ),
        ],
      },
    },
    {
      key: 'project',
      icon: ProjectsIcon,
      title: 'Convert to project',
      state: locked.project
        ? 'locked'
        : waiting.project
          ? 'active'
          : reached.project
            ? 'done'
            : 'neutral',
      stateLabel: waiting.project ? 'Waiting' : undefined,
      meta: waiting.project
        ? [
            wonAwaiting > 0 ? `${wonAwaiting.toLocaleString()} to convert` : null,
            draftProjects > 0 ? `${plural(draftProjects, 'draft')}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : summary.projects
          ? `${plural(projectsTotal, 'project')} so far`
          : undefined,
      cta: projectCta,
      details: {
        title: 'Step 3 · Convert to project',
        description: 'A won proposal becomes a numbered project, which opens as a draft.',
        rows: [
          ...countRow('Won, awaiting conversion', summary.proposals ? wonAwaiting : undefined),
          ...countRow('Draft, not yet activated', summary.projects ? draftProjects : undefined),
          ...countRow('Projects in total', summary.projects ? projectsTotal : undefined),
        ],
        notes: [
          ...note(
            'Prerequisites',
            'A won proposal with a property attached — or a client and property to create a project directly.',
          ),
          ...(locked.project
            ? note('Why it is locked', 'There is no property yet, and both routes need one.')
            : []),
          ...note('Last update', lastActivity(['Project'])),
          ...note(
            'Next action',
            wonAwaiting > 0
              ? 'Open each won proposal and convert it to a project.'
              : draftProjects > 0
                ? 'Activate draft projects to start their work.'
                : 'Convert the next won proposal, or create a project directly.',
          ),
        ],
      },
    },
    {
      key: 'delivery',
      icon: PlanningIcon,
      title: 'Planning & supervision',
      state: locked.delivery
        ? 'locked'
        : activeProjects > 0
          ? 'active'
          : deliveryStarted
            ? 'done'
            : 'neutral',
      stateLabel: activeProjects > 0 ? 'In progress' : undefined,
      meta: summary.projects ? `${activeProjects.toLocaleString()} active` : undefined,
      cta: deliveryCta,
      details: {
        title: 'Step 4 · Planning & supervision',
        description: "The project's type decides which workstreams it opens with.",
        rows: [
          ...countRow('Active projects', summary.projects ? activeProjects : undefined),
          ...countRow('On hold', projectCounts?.ON_HOLD),
          ...countRow('With planning', summary.projects?.byType?.planning),
          ...countRow('With supervision', summary.projects?.byType?.supervision),
        ],
        notes: [
          ...note('Prerequisites', 'A project whose type includes planning, supervision or both.'),
          ...(locked.delivery ? note('Why it is locked', 'There is no project yet.') : []),
          ...note('Last update', lastActivity(['Project', 'Issue'])),
          ...note(
            'To complete',
            'Planning: every submission decided, milestone reached and activity done. Supervision: no open issue and nothing awaiting approval. Then every workstream must be Completed before the project can be.',
          ),
          ...note('Next action', 'Work each project from its own planning or supervision page.'),
        ],
      },
    },
    {
      key: 'close',
      icon: ApprovalsIcon,
      title: 'Handover & close',
      state: locked.close
        ? 'locked'
        : waiting.close
          ? 'active'
          : (projectCounts?.CLOSED ?? 0) > 0
            ? 'done'
            : 'neutral',
      stateLabel: waiting.close ? 'Waiting' : undefined,
      meta: summary.handover
        ? waiting.close
          ? `${readyToClose.toLocaleString()} ready to close`
          : `${summary.handover.completedNotClosed.toLocaleString()} awaiting handover`
        : undefined,
      cta: waiting.close
        ? { href: '/projects?status=COMPLETED', label: 'Review ready' }
        : { href: '/projects', label: 'View projects' },
      details: {
        title: 'Step 5 · Handover & close',
        description: 'A completed project closes once its handover is done. Closed is final.',
        rows: [
          ...countRow('Completed, not closed', summary.handover?.completedNotClosed),
          ...countRow(
            'Ready to close',
            summary.handover?.ready,
            readyToClose > 0 ? 'success' : undefined,
          ),
          ...countRow('Closed', projectCounts?.CLOSED),
        ],
        notes: [
          ...note(
            'Prerequisites',
            'No open issues, every required document uploaded and the handover checklist complete.',
          ),
          ...(locked.close ? note('Why it is locked', 'No project is under way yet.') : []),
          ...note(
            'Next action',
            readyToClose > 0
              ? 'Close the projects that are ready.'
              : 'Finish the handover checklist on completed projects.',
          ),
        ],
      },
    },
  ];

  // The step to point at: first, anything genuinely waiting on a hand-off
  // (won proposals, drafts, projects ready to close); failing that, the
  // earliest setup step not yet reached; failing that — everything is set up
  // and nothing is waiting — the start of the next piece of work.
  const waitingIndex = steps.findIndex(
    (step) => (step.key === 'project' || step.key === 'close') && step.state === 'active',
  );
  const setupKeys = ['proposal', 'registry', 'project'] as const;
  const unreachedIndex = steps.findIndex(
    (step) =>
      (setupKeys as readonly string[]).includes(step.key) &&
      reached[step.key as (typeof setupKeys)[number]] === false &&
      step.state !== 'locked',
  );
  const nextIndex =
    waitingIndex >= 0
      ? waitingIndex
      : unreachedIndex >= 0
        ? unreachedIndex
        : summary.proposals && session.can('proposal:create')
          ? 0
          : -1;
  const nextStep = nextIndex >= 0 ? steps[nextIndex] : undefined;
  if (nextStep) nextStep.state = 'next';

  // The step cards keep their counts terse; this line spells out the one
  // that matters in full.
  const waitingDetail =
    nextStep?.key === 'project'
      ? [
          wonAwaiting > 0 ? `${plural(wonAwaiting, 'won proposal')} to convert` : null,
          draftProjects > 0 ? `${plural(draftProjects, 'draft project')} to activate` : null,
        ]
          .filter(Boolean)
          .join(' and ')
      : `${plural(readyToClose, 'completed project')} ready to close`;
  const nextSummary = !nextStep
    ? null
    : waitingIndex >= 0
      ? `Work is waiting at step ${nextIndex + 1}: ${waitingDetail}.`
      : unreachedIndex >= 0
        ? `Start here: ${nextStep.title.toLowerCase()}.`
        : 'Everything is set up and nothing is waiting on a hand-off. New work starts with a proposal.';

  return {
    steps,
    nextIndex,
    nextSummary,
    clientsTotal,
    wonAwaiting,
    draftProjects,
    activeProjects,
    readyToClose,
  };
}
