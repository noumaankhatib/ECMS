import { PROPOSAL_STATUSES } from '@ecms/contracts';
import Link from 'next/link';

import { Card, CodeTag, DateText, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Page as ApiPage, Proposal } from '@/lib/types';

export const metadata = { title: 'Proposals — ECMS' };

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
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const session = await requirePermission('proposal:view');
  const params = await searchParams;

  const query = new URLSearchParams({ pageSize: '100' });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const page = await api.get<ApiPage<Proposal>>(`/proposals?${query.toString()}`);

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

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by contact or sketch number"
          aria-label="Search proposals"
          style={{ maxWidth: 320 }}
        />
        <select name="status" defaultValue={params.status ?? ''} aria-label="Filter by status">
          <option value="">Any status</option>
          {PROPOSAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status] ?? status}
            </option>
          ))}
        </select>
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No proposals found">
            {params.search || params.status
              ? 'Try a different search or status.'
              : 'Log the first inquiry to begin.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sketch no.</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Received</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((proposal) => (
                <tr key={proposal.id}>
                  <td className="mono">
                    <Link href={`/proposals/${proposal.id}`}>
                      <CodeTag>{proposal.sketchNumber}</CodeTag>
                    </Link>
                  </td>
                  <td>{proposal.contactName}</td>
                  <td>
                    <span className="badge">
                      {STATUS_LABEL[proposal.status] ?? proposal.status}
                    </span>
                  </td>
                  <td className="nowrap">
                    <DateText value={proposal.receivedAt} />
                  </td>
                  <td className="right">
                    <Value>{proposal.contactPhone}</Value>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
        {page.total} {page.total === 1 ? 'proposal' : 'proposals'}
      </p>
    </>
  );
}
