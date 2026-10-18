import { PROPOSAL_STATUSES } from '@ecms/contracts';
import Link from 'next/link';

import { Card, CodeTag, DateText, Empty, PageHead, Pagination } from '@/components/ui';
import { api } from '@/lib/api';
import { loadProjectCodes } from '@/lib/project-codes';
import { requirePermission } from '@/lib/session';
import type { Page as ApiPage, ProposalListItem } from '@/lib/types';
import { loadUserNames } from '@/lib/user-names';

export const metadata = { title: 'Proposals — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONCEPT: 'Concept',
  CLIENT_REVISION: 'Client revision',
  APPROVED: 'Approved',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  CONVERTED: 'Converted',
};

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; mine?: string; page?: string }>;
}) {
  const session = await requirePermission('proposal:view');
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.mine === '1') query.set('assignedArchitectId', session.user.id);

  const page = await api.get<ApiPage<ProposalListItem>>(`/proposals?${query.toString()}`);

  // Names and codes for just the people and projects on this page.
  const [architectName, projectCode] = await Promise.all([
    session.can('user:view')
      ? loadUserNames(page.items.map((p) => p.assignedArchitectId))
      : new Map<string, string>(),
    loadProjectCodes(page.items.map((p) => p.convertedProjectId)),
  ]);

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.mine === '1') q.set('mine', '1');
    q.set('page', String(targetPage));
    return `/proposals?${q.toString()}`;
  }

  return (
    <>
      <PageHead
        title="Proposals"
        description="Inquiries and sketches, from first contact to conversion."
      >
        <a href="/export/proposals" className="button button--secondary">
          Export CSV
        </a>
        {session.can('proposal:create') ? (
          <Link href="/proposals/new" className="button">
            New proposal
          </Link>
        ) : null}
      </PageHead>

      <form className="filter-bar">
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by sketch no., contact, client, plot, architect"
          aria-label="Search proposals"
        />
        <select name="status" defaultValue={params.status ?? ''} aria-label="Filter by status">
          <option value="">Any status</option>
          {PROPOSAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status] ?? status}
            </option>
          ))}
        </select>
        <label className="check-inline">
          <input type="checkbox" name="mine" value="1" defaultChecked={params.mine === '1'} /> My
          proposals
        </label>
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No proposals found">
            {params.search || params.status || params.mine
              ? 'Try a different search or status.'
              : 'Log the first inquiry to begin.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table--cards">
              <thead>
                <tr>
                  <th>Sketch no.</th>
                  <th>Client</th>
                  <th>Property</th>
                  <th>Contact</th>
                  <th>Architect</th>
                  <th>Status</th>
                  <th>Project</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((proposal) => (
                  <tr key={proposal.id}>
                    <td data-label="Sketch no." className="mono">
                      <Link href={`/proposals/${proposal.id}`}>
                        <CodeTag>{proposal.sketchNumber}</CodeTag>
                      </Link>
                    </td>
                    <td data-label="Client">
                      {proposal.clientId && proposal.clientName ? (
                        <Link href={`/clients/${proposal.clientId}`}>{proposal.clientName}</Link>
                      ) : (
                        <span className="faint">Not attached</span>
                      )}
                    </td>
                    <td data-label="Property">
                      {proposal.propertyId && proposal.propertyName ? (
                        <>
                          <Link href={`/properties/${proposal.propertyId}`}>
                            {proposal.propertyName}
                          </Link>
                          {proposal.propertyLocation ? (
                            <div className="hint">{proposal.propertyLocation}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="faint">Not attached</span>
                      )}
                    </td>
                    <td data-label="Contact">
                      {proposal.contactName}
                      {proposal.contactPhone ? (
                        <div className="hint">{proposal.contactPhone}</div>
                      ) : null}
                    </td>
                    <td data-label="Architect" className="nowrap">
                      {proposal.assignedArchitectId && architectName.get(proposal.assignedArchitectId) ? (
                        <Link href={`/users/${proposal.assignedArchitectId}`}>
                          {architectName.get(proposal.assignedArchitectId)}
                        </Link>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className="badge">
                        {STATUS_LABEL[proposal.status] ?? proposal.status}
                      </span>
                    </td>
                    <td data-label="Project" className="mono">
                      {proposal.convertedProjectId && projectCode.get(proposal.convertedProjectId) ? (
                        <Link href={`/projects/${proposal.convertedProjectId}`}>
                          {projectCode.get(proposal.convertedProjectId)}
                        </Link>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td data-label="Received" className="nowrap">
                      <DateText value={proposal.receivedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={page.total} buildHref={buildHref} />
    </>
  );
}
