import type { DashboardSummary } from '@ecms/contracts';

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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/**
 * The signed-in landing page (docs/phase-11-plan.md §8). Every card below is
 * rendered only when the summary carries that key — the API omits a section
 * entirely rather than sending zeros for something this person may not see.
 */
export default async function DashboardPage() {
  await requireSession();
  const summary = await api.get<DashboardSummary>('/dashboard');

  const hasAnything =
    summary.projects || summary.proposals || summary.issues || summary.supervisionAgreements || summary.handover;

  return (
    <>
      <PageHead title="Dashboard" description="Where the portfolio stands right now." />

      {!hasAnything ? (
        <Card>
          <CardBody>
            <Empty title="Nothing to show yet">
              You do not currently hold a role with a view permission on any register.
            </Empty>
          </CardBody>
        </Card>
      ) : null}

      <div className="stack">
        {summary.projects ? (
          <Card>
            <CardHead title="Projects" />
            <CardBody>
              <div className="stat-grid">
                {Object.entries(summary.projects).map(([status, count]) => (
                  <Stat key={status} value={count} label={PROJECT_STATUS_LABEL[status] ?? status} />
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {summary.proposals ? (
          <Card>
            <CardHead title="Proposals" />
            <CardBody>
              <div className="stat-grid">
                {Object.entries(summary.proposals).map(([status, count]) => (
                  <Stat key={status} value={count} label={PROPOSAL_STATUS_LABEL[status] ?? status} />
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {summary.issues ? (
          <Card>
            <CardHead title="Issues" />
            <CardBody>
              <div className="stat-grid">
                <Stat value={summary.issues.open} label="Open" />
                <Stat value={summary.issues.closed} label="Closed" />
                <Stat value={summary.issues.overdue} label="Overdue" />
              </div>
            </CardBody>
          </Card>
        ) : null}

        {summary.supervisionAgreements ? (
          <Card>
            <CardHead title="Supervision agreements" />
            <CardBody>
              <div className="stat-grid">
                <Stat value={summary.supervisionAgreements.active} label="Active" />
                <Stat value={summary.supervisionAgreements.nearingQuota} label="Nearing quota" />
              </div>
            </CardBody>
          </Card>
        ) : null}

        {summary.handover ? (
          <Card>
            <CardHead title="Handover" />
            <CardBody>
              <div className="stat-grid">
                <Stat value={summary.handover.completedNotClosed} label="Completed, not closed" />
                <Stat value={summary.handover.ready} label="Ready to close" />
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
