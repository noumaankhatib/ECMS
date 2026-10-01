import { type DashboardSummary, PROJECT_TRANSITIONS, PROPOSAL_TRANSITIONS } from '@ecms/contracts';
import Link from 'next/link';

import { CheckIcon } from '@/components/icons';
import { SampleForm, type SampleFormSpec } from '@/components/sample-form';
import { Breadcrumb, PageHead } from '@/components/ui';
import { type WorkflowStep, WorkflowSteps } from '@/components/workflow';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Property } from '@/lib/types';
import {
  buildWorkflow,
  nextStatuses,
  PROJECT_STATUS_LABEL,
  PROPOSAL_FUNNEL_ORDER,
  PROPOSAL_STATUS_LABEL,
} from '@/lib/workflow';

export const metadata = { title: 'Workflow — ECMS' };

/** One status row in a step's rail: a real count, where it goes next, and
 *  the filtered list behind it. */
interface StatusRow {
  label: string;
  count: number | null;
  moves?: string | undefined;
  href?: string | undefined;
}

/**
 * The full workflow — the destination of the dashboard's "View full
 * workflow". The stepper at the top is the dashboard's own, from the same
 * `buildWorkflow`, so the two can never disagree.
 *
 * Below it, each step as the application actually runs it: what must exist
 * first, the real form(s) — every field, hint and button label copied from
 * the form itself — shown filled with clearly-badged example values, and the
 * live count of every status that belongs to the step.
 */
export default async function WorkflowPage() {
  const session = await requireSession();

  const [summary, propertiesTotal] = await Promise.all([
    api.get<DashboardSummary>('/dashboard'),
    session.can('property:view')
      ? api
          .get<ApiPage<Property>>('/properties?pageSize=1')
          .then((page) => page.total)
          .catch(() => null)
      : null,
  ]);

  const { steps, nextIndex, nextSummary, clientsTotal } = buildWorkflow(
    session,
    summary,
    propertiesTotal,
  );

  const projectCounts = summary.projects as Record<string, number> | undefined;
  const proposalCounts = summary.proposals as Record<string, number> | undefined;
  const can = (permission: Parameters<typeof session.can>[0], href: string) =>
    session.can(permission) ? href : undefined;

  const proposalRow = (status: string): StatusRow => ({
    label: PROPOSAL_STATUS_LABEL[status] ?? status,
    count: proposalCounts ? (proposalCounts[status] ?? 0) : null,
    moves:
      status === 'WON'
        ? 'Converted, by converting it to a project'
        : (nextStatuses(PROPOSAL_TRANSITIONS, PROPOSAL_STATUS_LABEL, status) ?? 'Final'),
    href: `/proposals?status=${status}`,
  });
  const projectRow = (status: string): StatusRow => ({
    label: PROJECT_STATUS_LABEL[status] ?? status,
    count: projectCounts ? (projectCounts[status] ?? 0) : null,
    moves: nextStatuses(PROJECT_TRANSITIONS, PROJECT_STATUS_LABEL, status) ?? 'Final',
    href: `/projects?status=${status}`,
  });

  const guide: Record<
    string,
    {
      summary: string;
      before: string[];
      forms: SampleFormSpec[];
      then: string[];
      statuses: StatusRow[];
      statusNote?: string | undefined;
    }
  > = {
    proposal: {
      summary:
        'Every piece of work starts as a proposal. Saving it issues a sketch number straight away, so it can be tracked from the first conversation.',
      before: ['Nothing — a client and property can be attached later.'],
      forms: [
        {
          title: 'New proposal',
          where: 'Proposals → New proposal',
          submitLabel: 'Create proposal',
          href: can('proposal:create', '/proposals/new'),
          fields: [
            { label: 'Contact name', example: 'Salim Al-Harthy', required: true, wide: true },
            { label: 'Contact phone', example: '+968 9123 4567' },
            {
              label: 'Client',
              example: 'Al-Harthy Trading LLC',
              kind: 'select',
              hint: 'Attach now if known, or leave blank and add it later.',
            },
            {
              label: 'Property',
              example: 'Al Mawaleh villa',
              kind: 'select',
              hint: 'Required before this proposal can be converted to a project.',
            },
            {
              label: 'Type of sketch',
              example: 'One of your sketch types',
              kind: 'select',
              hint: 'The list is managed under Setup → Sketch types.',
            },
            { label: 'Eventual project type', example: 'Planning and supervision', kind: 'select' },
            { label: 'Approx. area (sqm)', example: '450' },
            { label: 'Source', example: 'Referral', hint: 'e.g. referral, walk-in, old customer.' },
            { label: 'Received', example: '01 / 10 / 2026', kind: 'date' },
            { label: 'Due', example: '15 / 10 / 2026', kind: 'date' },
            {
              label: 'Notes',
              example: 'Two-storey villa. Client would like a first concept by mid-October.',
              kind: 'textarea',
            },
          ],
          moreOptional: 'Assigned architect is also offered to anyone who can see the user list.',
        },
      ],
      then: [
        'Open the proposal and move it along from its Status card: New → Concept → Client revision → Approved → Won.',
        'It can be put On hold or marked Lost at most stages.',
      ],
      statuses: PROPOSAL_FUNNEL_ORDER.filter((status) => status !== 'CONVERTED').map(proposalRow),
    },
    registry: {
      summary:
        'A proposal can start without them, but nothing converts into a project until the client and their property are on record.',
      before: ['A property can only be added to a client that already exists.'],
      forms: [
        {
          title: 'New client',
          where: 'Clients → New client',
          submitLabel: 'Create client',
          href: can('client:create', '/clients/new'),
          fields: [
            { label: 'Name', example: 'Al-Harthy Trading LLC', required: true, wide: true },
            { label: 'Type', example: 'Company', kind: 'select' },
            {
              label: 'Reference',
              example: 'CL-0241',
              hint: 'Your own reference for this client. Must be unique.',
            },
            {
              label: 'CR number',
              example: '1234567',
              hint: 'Commercial Registration — companies.',
            },
            {
              label: 'Civil ID',
              example: 'Left blank for a company',
              hint: 'Civil ID or passport number — individuals.',
            },
          ],
          moreOptional: 'Notes is optional.',
        },
        {
          title: 'New property',
          where: 'Properties → New property',
          submitLabel: 'Create property',
          href: can('property:create', '/properties/new'),
          fields: [
            {
              label: 'Client',
              example: 'Al-Harthy Trading LLC',
              required: true,
              kind: 'select',
              wide: true,
            },
            { label: 'Name', example: 'Al Mawaleh villa', required: true },
            { label: 'Reference', example: 'PR-0388', hint: 'Unique among live properties.' },
            { label: 'Address line 1', example: 'Way 4521, Building 214', wide: true },
            { label: 'Town or city', example: 'Muscat' },
            { label: 'Plot number', example: '214', hint: "The Krookie's plot number." },
            { label: 'Wilayat', example: 'Seeb' },
            { label: 'Village', example: 'Al Mawaleh' },
            {
              label: 'Title deed reference',
              example: 'MLK-2026-11893',
              hint: "The Mulkia's deed reference.",
            },
            { label: 'Owner name', example: 'Salim Al-Harthy', hint: 'Per the title deed.' },
          ],
          moreOptional:
            'Address line 2, Postcode, Country, Survey reference, Owner national ID and Notes are optional.',
        },
      ],
      then: [
        'If a name or reference looks like an existing record, the form warns you before saving — it does not block you.',
        'Attach the property to the proposal from the proposal’s Edit page.',
      ],
      statuses: [
        { label: 'Clients', count: clientsTotal, href: '/clients' },
        { label: 'Properties', count: propertiesTotal, href: '/properties' },
      ],
      statusNote: 'Clients and properties have no status of their own — these are totals.',
    },
    project: {
      summary:
        'A won proposal becomes a numbered project. A project can also be created directly when there was no proposal.',
      before: [
        'To convert: the proposal is Won and has a property attached.',
        'To create directly: the client and property already exist.',
      ],
      forms: [
        {
          title: 'New project',
          where: 'Projects → New project — or “Convert to project” on a won proposal',
          submitLabel: 'Create project',
          href: can('project:create', '/projects/new'),
          fields: [
            { label: 'Client', example: 'Al-Harthy Trading LLC', required: true, kind: 'select' },
            {
              label: 'Property',
              example: 'Al Mawaleh villa — Al-Harthy Trading LLC',
              required: true,
              kind: 'select',
              hint: 'Must belong to the client above.',
            },
            {
              label: 'Project code',
              example: 'Left blank',
              hint: 'Leave blank to generate one automatically for the selected type.',
            },
            { label: 'Name', example: 'Al Mawaleh villa', required: true },
            {
              label: 'Type',
              example: 'Planning and supervision',
              required: true,
              kind: 'select',
              hint: 'Decides which workstreams the project opens with.',
            },
            { label: 'Start date', example: '20 / 10 / 2026', kind: 'date' },
            { label: 'Target end date', example: '30 / 06 / 2027', kind: 'date' },
          ],
          moreOptional: 'Description is optional. You are added to the project automatically.',
        },
      ],
      then: [
        'Converting a won proposal needs no form — it takes the details from the proposal.',
        'Every new project opens as a Draft. Use Activate on its Status card to start the work.',
      ],
      statuses: [proposalRow('WON'), proposalRow('CONVERTED'), projectRow('DRAFT')],
    },
    delivery: {
      summary:
        'The project’s type decides what opens: planning, supervision, or both. Each is worked from its own page inside the project.',
      before: ['An active project whose type includes planning, supervision or both.'],
      forms: [
        {
          title: 'Add submission',
          where: 'Project → Planning → Submissions',
          submitLabel: 'Add submission',
          fields: [
            { label: 'Reference', example: 'SUB-2026-0142', required: true },
            { label: 'Authority', example: 'Muscat Municipality', required: true },
            { label: 'Department', example: 'Planning', kind: 'select' },
            {
              label: 'Pending with',
              example: 'Authority',
              hint: 'Who currently holds this — the client, the authority, us…',
            },
          ],
          moreOptional: 'Notes is optional. Activities and milestones are added on the same page.',
        },
        {
          title: 'Record agreement',
          where: 'Project → Supervision → Agreements',
          submitLabel: 'Record agreement',
          fields: [
            { label: 'Type', example: 'Monthly', required: true, kind: 'select' },
            { label: 'Visits allowed', example: '8', required: true },
            { label: 'Amount', example: '1200', required: true },
            { label: 'Start date', example: '01 / 11 / 2026', required: true, kind: 'date' },
            { label: 'End date', example: '30 / 04 / 2027', kind: 'date' },
          ],
          moreOptional: 'Notes is optional.',
        },
        {
          title: 'Record site visit',
          where: 'Project → Supervision',
          submitLabel: 'Record site visit',
          fields: [
            { label: 'Visit date', example: '12 / 11 / 2026', required: true, kind: 'date' },
            { label: 'Attendees', example: 'Site engineer, contractor', hint: 'Who was there.' },
            {
              label: 'Notes',
              example: 'Ground-floor slab checked against drawings. No issues raised.',
              kind: 'textarea',
            },
          ],
        },
      ],
      then: [
        'Planning work that later needs supervision is upgraded in place from Supervision → Add supervision — it keeps its code.',
        'Complete each workstream when its work is finished. Planning needs every submission decided or withdrawn, every milestone reached and every activity done; supervision needs no open supervision issue and nothing awaiting approval in drawings or modifications.',
        'Once every workstream is Completed, Mark complete on the project’s Status card unlocks. The project page lists anything still outstanding, with a link to it.',
      ],
      statuses: [projectRow('ACTIVE'), projectRow('ON_HOLD')],
      statusNote: summary.projects?.byType
        ? `${summary.projects.byType.planning.toLocaleString()} projects include planning and ${summary.projects.byType.supervision.toLocaleString()} include supervision.`
        : undefined,
    },
    close: {
      summary:
        'A completed project closes once its handover is done. Closing is final — a closed project accepts no further change.',
      before: [
        'The project is Completed.',
        'No open issues.',
        'Every required document is uploaded.',
        'The handover checklist is complete.',
      ],
      forms: [],
      then: [
        'Mark complete on the project’s Status card. The Handover card then appears on the same project page.',
        'Use Mark done on each checklist item as it arrives — the date is recorded, and an item cannot be unticked.',
        'Once there are no open issues, no missing documents and every item is done, the Close button unlocks.',
      ],
      statuses: [
        projectRow('COMPLETED'),
        {
          label: 'Ready to close',
          count: summary.handover ? summary.handover.ready : null,
          href: '/projects?status=COMPLETED',
        },
        projectRow('CLOSED'),
      ],
    },
  };

  /** The six handover items, as the project page lists them. */
  const HANDOVER_ITEMS = [
    'Final inspection done',
    'Authority completion documents received',
    'Mandatory tests received',
    'As-built drawings received',
    'Warranties received',
    'Final report issued',
  ];

  const stateLabel = (step: WorkflowStep) =>
    step.state === 'next'
      ? 'Next step'
      : (step.stateLabel ??
        { active: 'In progress', done: 'Done', locked: 'Locked', neutral: null, next: null }[
          step.state
        ]);

  return (
    <>
      <Breadcrumb items={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Workflow' }]} />
      <PageHead
        title="Workflow"
        description="How work moves through ECMS, step by step — with live counts, and an example of what to fill in at each step."
      />

      <div className="dashboard">
        <section className="card workflow-card" aria-labelledby="workflow-overview">
          <header className="workflow-card__head">
            <div>
              <h2 id="workflow-overview">Where things stand</h2>
              {nextSummary ? <p>{nextSummary}</p> : null}
            </div>
          </header>
          <div className="card__body">
            <WorkflowSteps steps={steps} />
          </div>
        </section>

        <nav className="guide-jump" aria-label="Jump to a step">
          {steps.map((step, index) => (
            <a
              key={step.key}
              href={`#step-${index + 1}`}
              className={index === nextIndex ? 'guide-jump--next' : ''}
            >
              <span>{index + 1}</span>
              {step.title}
            </a>
          ))}
        </nav>

        {steps.map((step, index) => {
          const content = guide[step.key];
          if (!content) return null;
          const label = stateLabel(step);
          const following = steps[index + 1];
          return (
            <section
              key={step.key}
              id={`step-${index + 1}`}
              className={`card guide-step ${index === nextIndex ? 'guide-step--next' : ''}`}
              aria-labelledby={`step-${index + 1}-title`}
            >
              <header className="guide-step__head">
                <span className={`guide-step__number guide-step__number--${step.state}`}>
                  {step.state === 'done' ? <CheckIcon width={16} height={16} /> : index + 1}
                </span>
                <div className="guide-step__heading">
                  <span className="guide-step__eyebrow">
                    Step {index + 1}
                    {label ? (
                      <span className={`workflow__state workflow__state--${step.state}`}>
                        {label}
                      </span>
                    ) : null}
                  </span>
                  <h2 id={`step-${index + 1}-title`}>{step.title}</h2>
                  <p>{content.summary}</p>
                </div>
                {step.cta && step.state !== 'locked' ? (
                  <Link
                    href={step.cta.href}
                    className={`button ${index === nextIndex ? '' : 'button--secondary'} guide-step__cta`}
                  >
                    {step.cta.label} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </header>

              <div className="guide-step__body">
                <div className="guide-step__main">
                  <div className="guide-block">
                    <h3>Before you start</h3>
                    <ul className="guide-list">
                      {content.before.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {content.forms.length > 0 ? (
                    <div className="guide-block">
                      <h3>What you fill in</h3>
                      <div className="stack">
                        {content.forms.map((form) => (
                          <SampleForm key={form.title} form={form} />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {step.key === 'close' ? (
                    <div className="guide-block">
                      <h3>Handover checklist — on the project page, once Completed</h3>
                      <ul className="guide-checklist">
                        {HANDOVER_ITEMS.map((item) => (
                          <li key={item}>
                            <span className="guide-checklist__box" aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="guide-block">
                    <h3>Then</h3>
                    <ol className="guide-list guide-list--numbered">
                      {content.then.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <aside className="guide-step__rail" aria-label={`Live status for ${step.title}`}>
                  <h3>Right now</h3>
                  <ul className="guide-status">
                    {content.statuses.map((row) => (
                      <li key={row.label}>
                        <div className="guide-status__top">
                          {row.href && row.count !== null ? (
                            <Link href={row.href}>{row.label}</Link>
                          ) : (
                            <span>{row.label}</span>
                          )}
                          <strong>{row.count === null ? '—' : row.count.toLocaleString()}</strong>
                        </div>
                        {row.moves ? (
                          <span className="guide-status__moves">Moves on to: {row.moves}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {content.statusNote ? (
                    <p className="guide-status__note">{content.statusNote}</p>
                  ) : null}
                  {following ? (
                    <a href={`#step-${index + 2}`} className="guide-step__following">
                      Next: {following.title} <span aria-hidden="true">↓</span>
                    </a>
                  ) : (
                    <p className="guide-status__note">This is the end of the workflow.</p>
                  )}
                </aside>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
