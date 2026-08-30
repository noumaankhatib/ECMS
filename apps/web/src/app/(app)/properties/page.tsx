import Link from 'next/link';

import { Card, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage, Property } from '@/lib/types';

export const metadata = { title: 'Properties — ECMS' };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; archived?: string }>;
}) {
  const session = await requirePermission('property:view');
  const params = await searchParams;

  const query = new URLSearchParams({ pageSize: '100' });
  if (params.search) query.set('search', params.search);
  if (params.archived === 'true') query.set('includeArchived', 'true');

  const [page, clients] = await Promise.all([
    api.get<ApiPage<Property>>(`/properties?${query.toString()}`),
    api.get<ApiPage<Client>>('/clients?pageSize=100&includeArchived=true'),
  ]);

  // A property row shows who it belongs to. Resolved here rather than asking
  // the API to embed it, so the list endpoint stays one simple query.
  const clientName = new Map(clients.items.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHead title="Properties" description="Sites and buildings, each belonging to a client.">
        {session.can('property:create') ? (
          <Link href="/properties/new" className="button">
            New property
          </Link>
        ) : null}
      </PageHead>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by name, reference, town or postcode"
          aria-label="Search properties"
          style={{ maxWidth: 360 }}
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
          <Empty title="No properties found">
            {params.search ? 'Try a different search term.' : 'Add one against a client.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Town or city</th>
                <th>Postcode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((property) => (
                <tr key={property.id}>
                  <td>
                    <Link href={`/properties/${property.id}`}>{property.name}</Link>
                  </td>
                  <td>
                    <Link href={`/clients/${property.clientId}`}>
                      <Value>{clientName.get(property.clientId)}</Value>
                    </Link>
                  </td>
                  <td>
                    <Value>{property.city}</Value>
                  </td>
                  <td className="mono">
                    <Value>{property.postcode}</Value>
                  </td>
                  <td className="right">
                    {property.archivedAt ? <span className="badge">Archived</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
        {page.total} {page.total === 1 ? 'property' : 'properties'}
      </p>
    </>
  );
}
