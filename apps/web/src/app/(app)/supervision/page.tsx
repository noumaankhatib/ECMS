import { PROJECT_STATUSES } from '@ecms/contracts';
import type { WorkstreamStats } from '@ecms/contracts';
import Link from 'next/link';

import {
  Card,
  CardBody,
  DateText,
  Empty,
  PageHead,
  Pagination,
  StatusBadge,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Client, Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Supervision — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

/**
 * Every project that runs supervision work — type SUPERVISION or BOTH, the
 * same union `ProjectService.list`'s `type` filter already applies. A row
 * jumps straight to that project's supervision sub-page, not the project
 * overview: this is where site-visit activity already lives.
 *
 * "New project" here goes to the attach/upgrade flow, not the generic
 * project form — the point of this section is either upgrading an existing
 * planning project in place or recording that supervision starts against
 * planning work this system never saw.
 */
export default async function SupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({
    page: String(pageNumber),
    pageSize: String(PAGE_SIZE),
    type: 'SUPERVISION',
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const [page, stats] = await Promise.all([
    api.get<ApiPage<Project>>(`/projects?${query.toString()}`),
    api.get<WorkstreamStats>('/insights/workstream-stats?type=SUPERVISION'),
  ]);

  const clients = session.can('client:view')
    ? await api.get<ApiPage<Client>>('/clients?pageSize=100&includeArchived=true')
    : { items: [] as Client[] };
  const clientName = new Map(clients.items.map((c) => [c.id, c.name]));

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    q.set('page', String(targetPage));
    return `/supervision?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Supervision" description="Every project running supervision work.">
        {session.can('project:edit') ? (
          <Link href="/supervision/new" className="button">
            New supervision
          </Link>
        ) : null}
      </PageHead>

      <Card>
        <CardBody>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__value">{stats.totalProjects}</span>
              <span className="stat__label">Total projects</span>
            </div>
            <div className="stat">
              <span className="stat__value">{stats.openIssues}</span>
              <span className="stat__label">Open issues</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <form className="row" style={{ margin: 'var(--space-4) 0' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by code or name"
          aria-label="Search supervision projects"
          style={{ maxWidth: 300 }}
        />
        <select
          name="status"
          defaultValue={params.status ?? ''}
          aria-label="Filter by status"
          style={{ width: 'auto' }}
        >
          <option value="">Any status</option>
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No supervision projects to show">
            {params.search || params.status
              ? 'Try a different search.'
              : 'You are not a member of any supervision project yet.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  {session.can('client:view') ? <th>Client</th> : null}
                  <th>Status</th>
                  <th>Target end</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((project) => (
                  <tr key={project.id}>
                    <td className="mono">
                      <Link href={`/projects/${project.id}/supervision`}>{project.code}</Link>
                    </td>
                    <td>{project.name}</td>
                    {session.can('client:view') ? (
                      <td>
                        <Value>{clientName.get(project.clientId)}</Value>
                      </td>
                    ) : null}
                    <td>
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="nowrap">
                      <DateText value={project.targetEndDate} />
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
