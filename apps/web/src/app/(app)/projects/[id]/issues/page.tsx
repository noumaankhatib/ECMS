import { ISSUE_STATUSES, WORKSTREAM_TYPES } from '@ecms/contracts';
import Link from 'next/link';

import {
  Badge,
  Breadcrumb,
  Card,
  DateText,
  Empty,
  PageHead,
  Pagination,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Issue, Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Issues — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const WORKSTREAM_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  SUPERVISION: 'Supervision',
};

/**
 * Issues — the fourth state machine in the system (phase-1-plan.md §5a).
 */
export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; workstreamType?: string; page?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { status, workstreamType, page: pageParam } = await searchParams;
  const pageNumber = Math.max(1, Number(pageParam) || 1);

  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (workstreamType) query.set('workstreamType', workstreamType);

  const [project, issues] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Issue>>(`/projects/${id}/issues?${query.toString()}`),
  ]);

  const closed = project.status === 'CLOSED';

  function buildHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (workstreamType) q.set('workstreamType', workstreamType);
    q.set('page', String(targetPage));
    return `/projects/${id}/issues?${q.toString()}`;
  }

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Issues' },
        ]}
      />
      <PageHead title="Issues" description={project.name}>
        <a href="/export/issues" className="button button--secondary">
          Export CSV (all visible projects)
        </a>
        {session.can('issue:create', id) && !closed ? (
          <Link href={`/projects/${id}/issues/new`} className="button">
            New issue
          </Link>
        ) : null}
      </PageHead>

      <form className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="Filter by status"
          style={{ width: 'auto' }}
        >
          <option value="">Any status</option>
          {ISSUE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {project.type === 'BOTH' ? (
          <select
            name="workstreamType"
            defaultValue={workstreamType ?? ''}
            aria-label="Filter by workstream"
            style={{ width: 'auto' }}
          >
            <option value="">Any workstream</option>
            {WORKSTREAM_TYPES.map((w) => (
              <option key={w} value={w}>
                {WORKSTREAM_LABEL[w]}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit" className="button button--secondary">
          Filter
        </button>
      </form>

      <Card>
        {issues.items.length === 0 ? (
          <Empty title="No issues to show">
            {status ? 'Try a different status.' : 'Nothing has been raised on this project yet.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  {project.type === 'BOTH' ? <th>Workstream</th> : null}
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {issues.items.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <Link href={`/projects/${id}/issues/${issue.id}`}>{issue.title}</Link>
                    </td>
                    {project.type === 'BOTH' ? (
                      <td>
                        <Value>
                          {issue.workstreamType ? WORKSTREAM_LABEL[issue.workstreamType] : null}
                        </Value>
                      </td>
                    ) : null}
                    <td>
                      <Badge>{issue.severity}</Badge>
                    </td>
                    <td>
                      <Value>{issue.priority}</Value>
                    </td>
                    <td>
                      <Badge>{STATUS_LABEL[issue.status] ?? issue.status}</Badge>
                    </td>
                    <td className="nowrap">
                      <DateText value={issue.dueDate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination
        page={pageNumber}
        pageSize={PAGE_SIZE}
        total={issues.total}
        buildHref={buildHref}
      />
    </>
  );
}
