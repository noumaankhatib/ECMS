import Link from 'next/link';

import { ActionButton } from '@/components/form';
import { RowMenu } from '@/components/row-menu';
import { Card, DateText, Empty, PageHead, Pagination } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage } from '@/lib/types';

import { archiveClient } from './actions';

export const metadata = { title: 'Clients — ECMS' };

const PAGE_SIZE = 10;

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; archived?: string; page?: string }>;
}) {
  const session = await requirePermission('client:view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (params.search) query.set('search', params.search);
  if (params.archived === 'true') query.set('includeArchived', 'true');

  const result = await api.get<ApiPage<Client>>(`/clients?${query.toString()}`);

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.archived === 'true') q.set('archived', 'true');
    q.set('page', String(targetPage));
    return `/clients?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Clients" description="Organisations the consultancy works for.">
        <a href="/export/clients" className="button button--secondary">
          Export CSV
        </a>
        {session.can('client:create') ? (
          <Link href="/clients/new" className="button">
            New client
          </Link>
        ) : null}
      </PageHead>

      <div className="summary-banner">
        <div>
          <span className="summary-banner__value">{result.total}</span>
          <span className="summary-banner__label"> Total clients</span>
        </div>
        <p>
          {params.archived === 'true'
            ? 'Includes archived clients.'
            : 'Archived clients are hidden — check "Include archived" to see them.'}
        </p>
      </div>

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
          Filters
        </button>
      </form>

      <Card>
        {result.items.length === 0 ? (
          <Empty title="No clients found">
            {params.search ? 'Try a different search term.' : 'Create the first one to begin.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Reference</th>
                  <th>Added</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div className="entity-cell">
                        <span className="entity-cell__icon">{initialsOf(client.name)}</span>
                        <Link href={`/clients/${client.id}`}>{client.name}</Link>
                      </div>
                    </td>
                    <td className="mono">{client.reference ?? <span className="faint">—</span>}</td>
                    <td className="nowrap">
                      <DateText value={client.createdAt} />
                    </td>
                    <td>
                      {client.archivedAt ? (
                        <span className="badge">Archived</span>
                      ) : (
                        <span className="badge badge--active">Active</span>
                      )}
                    </td>
                    <td className="right">
                      <RowMenu>
                        <Link href={`/clients/${client.id}`}>View</Link>
                        {session.can('client:edit') ? (
                          <Link href={`/clients/${client.id}/edit`}>Edit</Link>
                        ) : null}
                        {session.can('client:archive') && !client.archivedAt ? (
                          <ActionButton
                            action={archiveClient.bind(null, client.id)}
                            label="Archive"
                            variant="danger"
                            confirm={`Archive ${client.name}? Properties and projects linked to it are unaffected, but it will no longer appear in new-record pickers.`}
                          />
                        ) : null}
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} buildHref={buildHref} />
    </>
  );
}
