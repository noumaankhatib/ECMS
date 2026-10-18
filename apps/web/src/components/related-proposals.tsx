import Link from 'next/link';

import { Card, CardHead, CodeTag, DateText, Empty } from '@/components/ui';
import { api } from '@/lib/api';
import type { Session } from '@/lib/session';
import type { Page, Proposal } from '@/lib/types';

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

/**
 * The proposals logged for one client or one property, so a record shows its
 * whole history rather than only the projects. Hidden for people who may not
 * see proposals, and quietly empty if the lookup fails.
 */
export async function RelatedProposals({
  filter,
  session,
}: {
  filter: { clientId: string } | { propertyId: string };
  session: Pick<Session, 'can'>;
}) {
  if (!session.can('proposal:view')) return null;

  const query = new URLSearchParams({ pageSize: '100' });
  if ('clientId' in filter) query.set('clientId', filter.clientId);
  else query.set('propertyId', filter.propertyId);

  const page = await api.get<Page<Proposal>>(`/proposals?${query.toString()}`).catch(() => null);
  if (!page) return null;

  return (
    <Card>
      <CardHead title="Proposals">
        <span className="count-pill">{page.total}</span>
      </CardHead>
      {page.items.length === 0 ? (
        <Empty title="No proposals">Nothing has been logged yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sketch no.</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Received</th>
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
                    <span className="badge">{STATUS_LABEL[proposal.status] ?? proposal.status}</span>
                  </td>
                  <td className="nowrap">
                    <DateText value={proposal.receivedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
