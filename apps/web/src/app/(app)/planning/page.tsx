import { PROJECT_STATUSES, type WorkstreamStats } from '@ecms/contracts';
import Link from 'next/link';

import { ProjectListTable } from '@/components/project-list-table';
import {
  Card,
  CardBody,
  Empty,
  PageHead,
  Pagination,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Planning — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

/**
 * Every project that runs planning work — type PLANNING or BOTH, the same
 * union `ProjectService.list`'s `type` filter already applies. A row jumps
 * straight to that project's planning sub-page, not the project overview:
 * this is where planning activity already lives.
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; mine?: string; page?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({
    page: String(pageNumber),
    pageSize: String(PAGE_SIZE),
    type: 'PLANNING',
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.mine === '1') query.set('memberId', session.user.id);

  const [page, stats] = await Promise.all([
    api.get<ApiPage<Project>>(`/projects?${query.toString()}`),
    api.get<WorkstreamStats>('/insights/workstream-stats?type=PLANNING'),
  ]);


  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.mine === '1') q.set('mine', '1');
    q.set('page', String(targetPage));
    return `/planning?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Planning" description="Every project running planning work.">
        {session.can('project:create') ? (
          <Link href="/projects/new" className="button">
            New project
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

      <form className="filter-bar">
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by code, name, client, plot or manager"
          aria-label="Search planning projects"
        />
        <select
          name="status"
          defaultValue={params.status ?? ''}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <label className="check-inline">
          <input type="checkbox" name="mine" value="1" defaultChecked={params.mine === '1'} /> My
          projects
        </label>
        <button type="submit" className="button button--secondary">
          Search
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No planning projects to show">
            {params.search || params.status || params.mine
              ? 'Try a different search.'
              : 'You are not a member of any planning project yet.'}
          </Empty>
        ) : (
          <ProjectListTable
            items={page.items}
            rowHref={(project) => `/projects/${project.id}/planning`}
            
            canClient={session.can('client:view')}
            canProperty={session.can('property:view')}
            canPeople={session.can('user:view')}
          />
        )}
      </Card>

      <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={page.total} buildHref={buildHref} />
    </>
  );
}
