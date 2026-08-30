import Link from 'next/link';

import { Card, DateText, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage } from '@/lib/types';

export const metadata = { title: 'Clients — ECMS' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; archived?: string }>;
}) {
  const session = await requirePermission('client:view');
  const params = await searchParams;

  const query = new URLSearchParams({ pageSize: '100' });
  if (params.search) query.set('search', params.search);
  if (params.archived === 'true') query.set('includeArchived', 'true');

  const page = await api.get<ApiPage<Client>>(`/clients?${query.toString()}`);

  return (
    <>
      <PageHead title="Clients" description="Organisations the consultancy works for.">
        {session.can('client:create') ? (
          <Link href="/clients/new" className="button">
            New client
          </Link>
        ) : null}
      </PageHead>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by name or reference"
          aria-label="Search clients"
          style={{ maxWidth: 320 }}
        />
        <label className="row" style={{ gap: 'var(--space-1)', fontSize: 14 }}>
          <input
            type="checkbox"
            name="archived"
            value="true"
            defaultChecked={params.archived === 'true'}
            style={{ width: 'auto' }}
          />
          Include archived
        </label>
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No clients found">
            {params.search ? 'Try a different search term.' : 'Create the first one to begin.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Reference</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/clients/${client.id}`}>{client.name}</Link>
                  </td>
                  <td className="mono">
                    <Value>{client.reference}</Value>
                  </td>
                  <td className="nowrap">
                    <DateText value={client.createdAt} />
                  </td>
                  <td className="right">
                    {client.archivedAt ? <span className="badge">Archived</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
        {page.total} {page.total === 1 ? 'client' : 'clients'}
      </p>
    </>
  );
}
