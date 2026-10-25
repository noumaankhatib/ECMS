import { PROJECT_STATUSES } from '@ecms/contracts';
import Link from 'next/link';

import { FilterBar } from '@/components/filter-bar';
import { ProjectListTable } from '@/components/project-list-table';
import { Card, Empty, PageHead, Pagination } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Projects — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

/**
 * The project list.
 *
 * This is where the authorization model is visible to a person: the rows are
 * whatever the API decided this caller may see, and nothing here filters them
 * further. Someone who is a member of no project sees an empty table — not a
 * table of other people's work with the buttons greyed out.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; mine?: string; page?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const pageNumber = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.mine === '1') query.set('memberId', session.user.id);

  const page = await api.get<ApiPage<Project>>(`/projects?${query.toString()}`);

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.mine === '1') q.set('mine', '1');
    q.set('page', String(targetPage));
    return `/projects?${q.toString()}`;
  }

  return (
    <>
      <PageHead title="Projects" description="The work you have access to.">
        <a href="/export/projects" className="button button--secondary">
          Export CSV
        </a>
        {session.can('project:create') ? (
          <Link href="/projects/new" className="button">
            New project
          </Link>
        ) : null}
      </PageHead>

      <FilterBar>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by code, name, client, plot or manager"
          aria-label="Search projects"
        />
        <select name="status" defaultValue={params.status ?? ''} aria-label="Filter by status">
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
      </FilterBar>

      <Card>
        {page.items.length === 0 ? (
          <Empty title="No projects to show">
            {params.search || params.status || params.mine
              ? 'Try a different search.'
              : 'You are not a member of any project yet. Ask an administrator or the project manager to add you.'}
          </Empty>
        ) : (
          <ProjectListTable
            items={page.items}
            rowHref={(project) => `/projects/${project.id}`}
            cards
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
