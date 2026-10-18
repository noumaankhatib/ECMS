import Link from 'next/link';

import { Card, Empty, PageHead, Pagination, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { loadClientNames } from '@/lib/client-names';
import { requirePermission } from '@/lib/session';
import type { Page as ApiPage, Property } from '@/lib/types';

export const metadata = { title: 'Properties — ECMS' };

const PAGE_SIZE = 25;

const LAND_USE_LABEL: Record<string, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  AGRICULTURAL: 'Agricultural',
  INDUSTRIAL: 'Industrial',
  MIXED_USE: 'Mixed use',
  GOVERNMENT: 'Government',
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; archived?: string; page?: string }>;
}) {
  const session = await requirePermission('property:view');
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
  if (params.search) query.set('search', params.search);
  if (params.archived === 'true') query.set('includeArchived', 'true');

  const page = await api.get<ApiPage<Property>>(`/properties?${query.toString()}`);

  // A property row shows who it belongs to. Resolved here rather than asking
  // the API to embed it, so the list endpoint stays one simple query.
  const clientName = await loadClientNames(page.items.map((p) => p.clientId));

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.archived === 'true') q.set('archived', 'true');
    q.set('page', String(targetPage));
    return `/properties?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Properties" description="Sites and buildings, each belonging to a client.">
        <a href="/export/properties" className="button button--secondary">
          Export CSV
        </a>
        {session.can('property:create') ? (
          <Link href="/properties/new" className="button">
            New property
          </Link>
        ) : null}
      </PageHead>

      <form className="filter-bar">
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by name, reference, town, postcode, plot number or Land ID"
          aria-label="Search properties"
        />
        <label className="row" style={{ gap: 'var(--space-1)', fontSize: 14 }}>
          <input
            type="checkbox"
            name="archived"
            value="true"
            defaultChecked={params.archived === 'true'}
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
          <div className="table-scroll">
            <table className="table--cards">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Land ID</th>
                  <th>Plot No.</th>
                  <th>Block No.</th>
                  <th>Plot area</th>
                  <th>Type of land use</th>
                  <th>Map</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {page.items.map((property) => (
                  <tr key={property.id}>
                    <td data-label="Name">
                      <Link href={`/properties/${property.id}`}>{property.name}</Link>
                    </td>
                    <td data-label="Client">
                      <Link href={`/clients/${property.clientId}`}>
                        <Value>{clientName.get(property.clientId)}</Value>
                      </Link>
                    </td>
                    <td data-label="Land ID" className="mono">
                      <Value>{property.surveyReference}</Value>
                    </td>
                    <td data-label="Plot No." className="mono">
                      <Value>{property.plotNumber}</Value>
                    </td>
                    <td data-label="Block No.">
                      <Value>{property.blockNumber}</Value>
                    </td>
                    <td data-label="Plot area">
                      {property.plotArea != null ? (
                        `${property.plotArea} sqm`
                      ) : (
                        <Value>{null}</Value>
                      )}
                    </td>
                    <td data-label="Type of land use">
                      <Value>
                        {property.landUseType
                          ? (LAND_USE_LABEL[property.landUseType] ?? property.landUseType)
                          : null}
                      </Value>
                    </td>
                    <td data-label="Map">
                      {property.mapUrl ? (
                        <a href={property.mapUrl} target="_blank" rel="noreferrer">
                          View on map
                        </a>
                      ) : (
                        <Value>{null}</Value>
                      )}
                    </td>
                    <td className="right">
                      {property.archivedAt ? <span className="badge">Archived</span> : null}
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
