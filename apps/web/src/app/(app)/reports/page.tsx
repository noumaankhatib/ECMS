import type { DashboardSummary } from '@ecms/contracts';

import { DonutChart, Funnel } from '@/components/charts';
import { Card, CardBody, CardHead, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

import { ReportsClient } from './reports-client';

export const metadata = { title: 'Reports & Analytics — ECMS' };

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
const PROPOSAL_FUNNEL_ORDER = Object.keys(PROPOSAL_STATUS_LABEL);
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

/**
 * A single landing spot for every CSV export already scattered across the
 * list pages (`/export/*.csv`, one per register) — this adds no new export,
 * it only gathers the existing links. Each card is gated by the same view
 * permission its own list page already requires before showing its own
 * "Export CSV" button. The visual analytics above the export grid reuse the
 * exact same `/dashboard` summary and chart components the dashboard already
 * renders — no new aggregation endpoint, just a second place to see it.
 */
export default async function ReportsPage() {
  const session = await requireSession();
  const summary = await api.get<DashboardSummary>('/dashboard');

  const cards = [
    {
      key: 'projects' as const,
      title: 'Projects',
      description: 'Every project in the portfolio, one row each.',
      href: '/export/projects',
      show: true,
    },
    {
      key: 'issues' as const,
      title: 'Issues',
      description: 'Open, closed and overdue issues across all projects.',
      href: '/export/issues',
      show: true,
    },
    {
      key: 'proposals' as const,
      title: 'Proposals',
      description: 'The proposal pipeline, stage by stage.',
      href: '/export/proposals',
      show: session.can('proposal:view'),
    },
    {
      key: 'clients' as const,
      title: 'Clients',
      description: 'The client register.',
      href: '/export/clients',
      show: session.can('client:view'),
    },
    {
      key: 'properties' as const,
      title: 'Properties',
      description: 'Every property on file.',
      href: '/export/properties',
      show: session.can('property:view'),
    },
  ];

  return (
    <>
      <PageHead
        title="Reports & Analytics"
        description="Export any register as CSV. The period toggle below is a view preference — every export still reflects the full, current register."
      />

      {!summary.projects && !summary.proposals && !summary.issues ? null : (
        <div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
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
              <CardHead title="Proposal funnel" />
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
                    <span className="stat__value stat__value--green">{summary.issues.closed}</span>
                    <span className="stat__label">Closed</span>
                  </div>
                  <div className="stat">
                    <span className="stat__value stat__value--red">{summary.issues.overdue}</span>
                    <span className="stat__label">Overdue</span>
                  </div>
                </div>
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
                    <span className="stat__value">{summary.supervisionAgreements.nearingQuota}</span>
                    <span className="stat__label">Nearing quota</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}

      {!summary.projects && !summary.proposals && !summary.issues && !summary.supervisionAgreements ? (
        <Card>
          <CardBody>
            <Empty title="Nothing to chart yet">
              You do not currently hold a view permission on any register with reportable stats.
            </Empty>
          </CardBody>
        </Card>
      ) : null}

      <ReportsClient cards={cards} />
    </>
  );
}
