import type { SearchResult, SearchResultType } from '@ecms/contracts';
import Link from 'next/link';

import { Card, CardBody, Empty, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Search — ECMS' };

const TYPE_LABEL: Record<SearchResultType, string> = {
  CLIENT: 'Client',
  PROPERTY: 'Property',
  PROJECT: 'Project',
  PROPOSAL: 'Proposal',
};

const RESULT_HREF: Record<SearchResultType, (id: string) => string> = {
  CLIENT: (id) => `/clients/${id}`,
  PROPERTY: (id) => `/properties/${id}`,
  PROJECT: (id) => `/projects/${id}`,
  PROPOSAL: (id) => `/proposals/${id}`,
};

/**
 * Fans out to each resource's own list search (docs/phase-11-plan.md §6) —
 * a resource type simply does not appear here if the caller cannot view it
 * anywhere, the same "omit, don't fake" rule the dashboard follows.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSession();
  const { q } = await searchParams;

  const results = q ? await api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`) : [];

  const byType = new Map<SearchResultType, SearchResult[]>();
  for (const result of results) {
    byType.set(result.type, [...(byType.get(result.type) ?? []), result]);
  }

  return (
    <>
      <PageHead title="Search" description={q ? `Results for "${q}"` : 'Across every register.'} />

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Client, property, project code, sketch number..."
          aria-label="Search"
          style={{ minWidth: 320 }}
        />
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      {q && results.length === 0 ? (
        <Card>
          <CardBody>
            <Empty title="No matches">Nothing in a register you can view matches "{q}".</Empty>
          </CardBody>
        </Card>
      ) : null}

      <div className="stack">
        {[...byType.entries()].map(([type, items]) => (
          <Card key={type}>
            <CardBody>
              <h3 style={{ marginTop: 0 }}>{TYPE_LABEL[type]}</h3>
              <ul className="stack">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link href={RESULT_HREF[type](item.id)}>{item.label}</Link>
                    {item.sublabel ? (
                      <span className="muted"> — {item.sublabel}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
