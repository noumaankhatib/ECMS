import { formatClientName } from '@ecms/contracts';
import Link from 'next/link';

import { FilterBar } from '@/components/filter-bar';
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

      <FilterBar>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by name, reference, CR/Civil ID or phone"
          aria-label="Search clients"
        />
        <label className="row u-gap-1 u-text-md">
          <input
            type="checkbox"
            name="archived"
            value="true"
            defaultChecked={params.archived === 'true'}
          />
          Include archived
        </label>
        <button type="submit" className="button button--secondary">
          Filters
        </button>
      </FilterBar>

      <Card>
        {result.items.length === 0 ? (
          <Empty title="No clients found">
            {params.search ? 'Try a different search term.' : 'Create the first one to begin.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table--cards">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Reference</th>
                  <th>ID Card #</th>
                  <th>Mobile</th>
                  <th>Added</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((client) => {
                  const clientName = formatClientName(client);
                  return (
                    <tr key={client.id}>
                      <td data-label="Name">
                        <div className="entity-cell">
                          <span className="entity-cell__icon">{initialsOf(clientName)}</span>
                          <Link href={`/clients/${client.id}`}>{clientName}</Link>
                        </div>
                      </td>
                      <td data-label="Reference" className="mono">
                        {client.reference ?? <span className="faint">—</span>}
                      </td>
                      <td data-label="ID Card #" className="mono">
                        {client.civilId ?? <span className="faint">—</span>}
                      </td>
                      <td data-label="Mobile" className="mono">
                        {client.mobileNumber ?? <span className="faint">—</span>}
                      </td>
                      <td data-label="Added" className="nowrap">
                        <DateText value={client.createdAt} />
                      </td>
                      <td data-label="Status">
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
                              confirm={`Archive ${clientName}? Properties and projects linked to it are unaffected, but it will no longer appear in new-record pickers.`}
                            />
                          ) : null}
                        </RowMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} buildHref={buildHref} />
    </>
  );
}
