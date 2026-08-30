import { PROJECT_STATUSES } from '@ecms/contracts';
import Link from 'next/link';

import { Card, DateText, Empty, PageHead, StatusBadge, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Client, Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Projects — ECMS' };

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
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const query = new URLSearchParams({ pageSize: '100' });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const page = await api.get<ApiPage<Project>>(`/projects?${query.toString()}`);

  // Only asked for if this person may see clients at all; a Planner may not.
  const clients = session.can('client:view')
    ? await api.get<ApiPage<Client>>('/clients?pageSize=100&includeArchived=true')
    : { items: [] as Client[] };
  const clientName = new Map(clients.items.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHead title="Projects" description="The work you have access to.">
        {session.can('project:create') ? (
          <Link href="/projects/new" className="button">
            New project
          </Link>
        ) : null}
      </PageHead>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <input
          type="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Search by code or name"
          aria-label="Search projects"
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
          <Empty title="No projects to show">
            {params.search || params.status
              ? 'Try a different search.'
              : 'You are not a member of any project yet. Ask an administrator or the project manager to add you.'}
          </Empty>
        ) : (
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
                    <Link href={`/projects/${project.id}`}>{project.code}</Link>
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
        )}
      </Card>

      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
        {page.total} {page.total === 1 ? 'project' : 'projects'}
      </p>
    </>
  );
}
