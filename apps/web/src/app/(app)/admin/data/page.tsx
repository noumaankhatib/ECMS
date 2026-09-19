import Link from 'next/link';

import { Card, DateText, Empty, PageHead, Pagination, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { Client, Page as ApiPage, Project, Property } from '@/lib/types';

export const metadata = { title: 'Data management — ECMS' };

const PAGE_SIZE = 20;

type Tab = 'clients' | 'properties' | 'projects' | 'proposals';

const TABS: { key: Tab; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'properties', label: 'Properties' },
  { key: 'projects', label: 'Projects' },
  { key: 'proposals', label: 'Proposals' },
];

interface ProposalRow {
  id: string;
  sketchNumber: string;
  contactName: string;
  status: string;
  createdAt: string;
}

export default async function AdminDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; search?: string; page?: string }>;
}) {
  await requirePermission('admin:data');
  const params = await searchParams;
  const tab = (params.tab ?? 'clients') as Tab;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search ?? '';

  function buildHref(targetPage: number, newTab?: Tab): string {
    const q = new URLSearchParams();
    q.set('tab', newTab ?? tab);
    if (search) q.set('search', search);
    if (targetPage > 1) q.set('page', String(targetPage));
    return `/admin/data?${q.toString()}`;
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), includeArchived: 'true' });
  if (search) query.set('search', search);

  type ListItem = { id: string; label: string; sublabel: string | null; status: string | null; createdAt: string | null; archivedAt: string | null };
  let items: ListItem[] = [];
  let total = 0;
  let entityType: 'client' | 'property' | 'project' | 'proposal' = 'client';

  if (tab === 'clients') {
    entityType = 'client';
    const result = await api.get<ApiPage<Client>>(`/clients?${query.toString()}`).catch(() => ({ items: [] as Client[], total: 0, page: 1, pageSize: PAGE_SIZE }));
    total = result.total;
    items = result.items.map((c) => ({ id: c.id, label: c.name, sublabel: c.reference ?? null, status: null, createdAt: c.createdAt, archivedAt: c.archivedAt ?? null }));
  } else if (tab === 'properties') {
    entityType = 'property';
    const result = await api.get<ApiPage<Property>>(`/properties?${query.toString()}`).catch(() => ({ items: [] as Property[], total: 0, page: 1, pageSize: PAGE_SIZE }));
    total = result.total;
    items = result.items.map((p) => ({ id: p.id, label: p.name, sublabel: p.reference ?? null, status: null, createdAt: null, archivedAt: p.archivedAt ?? null }));
  } else if (tab === 'projects') {
    entityType = 'project';
    const result = await api.get<ApiPage<Project>>(`/projects?${query.toString()}`).catch(() => ({ items: [] as Project[], total: 0, page: 1, pageSize: PAGE_SIZE }));
    total = result.total;
    items = result.items.map((p) => ({ id: p.id, label: p.name, sublabel: p.code, status: p.status, createdAt: p.createdAt, archivedAt: null }));
  } else if (tab === 'proposals') {
    entityType = 'proposal';
    const result = await api.get<ApiPage<ProposalRow>>(`/proposals?${query.toString()}`).catch(() => ({ items: [] as ProposalRow[], total: 0, page: 1, pageSize: PAGE_SIZE }));
    total = result.total;
    items = result.items.map((p) => ({ id: p.id, label: p.contactName, sublabel: p.sketchNumber, status: p.status, createdAt: p.createdAt, archivedAt: null }));
  }

  return (
    <>
      <PageHead
        title="Data management"
        description="View linkages and selectively archive or permanently delete records."
      />

      <div className="summary-banner">
        <div>
          <span className="summary-banner__value">{total}</span>
          <span className="summary-banner__label"> {TABS.find((t) => t.key === tab)?.label ?? ''}</span>
        </div>
        <p style={{ color: 'var(--color-danger, #c0392b)', fontWeight: 500 }}>
          Hard delete is permanent and cannot be undone. Review the impact tree carefully.
        </p>
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-4)', gap: 'var(--space-2)' }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildHref(1, t.key)}
            className={`button ${tab === t.key ? '' : 'button--secondary'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input type="hidden" name="tab" value={tab} />
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder={`Search ${tab}…`}
          aria-label={`Search ${tab}`}
          style={{ maxWidth: 320 }}
        />
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {items.length === 0 ? (
          <Empty title="Nothing found">Try a different search or tab.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  {tab !== 'clients' && tab !== 'properties' ? <th>Status</th> : <th>Reference</th>}
                  <th>Created</th>
                  <th>Archived</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="entity-cell">
                        <span className="entity-cell__icon">
                          {item.label.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          {item.label}
                          {item.sublabel ? (
                            <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>
                              {item.sublabel}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      {item.status ? (
                        <StatusBadge status={item.status} />
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td className="nowrap">
                      {item.createdAt ? <DateText value={item.createdAt} /> : <span className="faint">—</span>}
                    </td>
                    <td>
                      {item.archivedAt ? (
                        <span className="badge">Archived</span>
                      ) : (
                        <span className="badge badge--active">Active</span>
                      )}
                    </td>
                    <td className="right">
                      <Link
                        href={`/admin/data/${entityType}/${item.id}`}
                        className="button button--secondary"
                        style={{ fontSize: 13 }}
                      >
                        View impact
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} buildHref={buildHref} />
    </>
  );
}
