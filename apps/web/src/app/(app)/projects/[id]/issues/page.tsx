import { ISSUE_STATUSES } from '@ecms/contracts';
import Link from 'next/link';

import { Badge, Breadcrumb, Card, DateText, Empty, PageHead, Value } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Issue, Page as ApiPage, Project } from '@/lib/types';

export const metadata = { title: 'Issues — ECMS' };

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/**
 * Issues — the fourth state machine in the system (phase-1-plan.md §5a).
 */
export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { status } = await searchParams;

  const query = new URLSearchParams({ pageSize: '100' });
  if (status) query.set('status', status);

  const [project, issues] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Issue>>(`/projects/${id}/issues?${query.toString()}`),
  ]);

  const closed = project.status === 'CLOSED';

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
          <table>
            <thead>
              <tr>
                <th>Title</th>
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
        )}
      </Card>
    </>
  );
}
