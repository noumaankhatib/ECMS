import type { UserWork } from '@ecms/contracts';
import Link from 'next/link';

import { Badge, Card, CardHead, DateText, Empty, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import type { Session } from '@/lib/session';
import type { Page, Project, Proposal } from '@/lib/types';

const PROPOSAL_STATUS: Record<string, string> = {
  NEW: 'New',
  CONCEPT: 'Concept',
  CLIENT_REVISION: 'Client revision',
  APPROVED: 'Approved',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  CONVERTED: 'Converted',
};

/**
 * What one person is carrying: the projects they are on, the proposals they
 * are architect for, and their open activities and issues. Every part is
 * fetched on its own and dropped quietly if the viewer may not see it (or the
 * lookup fails), so the page never errors over a missing permission.
 */
export async function UserWorkSections({
  userId,
  session,
}: {
  userId: string;
  session: Pick<Session, 'can'>;
}) {
  const [projects, proposals, work] = await Promise.all([
    api
      .get<Page<Project>>(`/projects?memberId=${userId}&pageSize=50`)
      .catch(() => null),
    session.can('proposal:view')
      ? api
          .get<Page<Proposal>>(`/proposals?assignedArchitectId=${userId}&pageSize=50`)
          .catch(() => null)
      : null,
    api.get<UserWork>(`/users/${userId}/work`).catch(() => null),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = (due: string | null): boolean => Boolean(due && due.slice(0, 10) < today);

  return (
    <div className="grid-2 grid-2--even grid-2--fill" style={{ marginBottom: 'var(--space-5)' }}>
      {projects ? (
        <Card accent="blue">
          <CardHead title="Projects">
            <span className="count-pill">{projects.total}</span>
          </CardHead>
          {projects.items.length === 0 ? (
            <Empty title="On no projects" />
          ) : (
            <div className="table-scroll">
              <table>
                <tbody>
                  {projects.items.map((project) => (
                    <tr key={project.id}>
                      <td className="mono">
                        <Link href={`/projects/${project.id}`}>{project.code}</Link>
                      </td>
                      <td>{project.name}</td>
                      <td>
                        <StatusBadge status={project.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {proposals ? (
        <Card accent="purple">
          <CardHead title="Proposals as architect">
            <span className="count-pill">{proposals.total}</span>
          </CardHead>
          {proposals.items.length === 0 ? (
            <Empty title="None assigned" />
          ) : (
            <div className="table-scroll">
              <table>
                <tbody>
                  {proposals.items.map((proposal) => (
                    <tr key={proposal.id}>
                      <td className="mono">
                        <Link href={`/proposals/${proposal.id}`}>{proposal.sketchNumber}</Link>
                      </td>
                      <td>{proposal.contactName}</td>
                      <td>
                        <span className="badge">
                          {PROPOSAL_STATUS[proposal.status] ?? proposal.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {work ? (
        <>
          <Card accent="green">
            <CardHead title="Open activities">
              <span className="count-pill">{work.activities.length}</span>
            </CardHead>
            {work.activities.length === 0 ? (
              <Empty title="Nothing open" />
            ) : (
              <div className="table-scroll">
                <table>
                  <tbody>
                    {work.activities.map((activity) => (
                      <tr key={activity.id}>
                        <td>
                          <Link href={`/projects/${activity.projectId}/planning`}>
                            {activity.title}
                          </Link>
                          <span className="cell-sub">
                            {activity.projectCode} · {activity.projectName}
                          </span>
                        </td>
                        <td className="nowrap">
                          {activity.dueDate ? <DateText value={activity.dueDate} /> : null}
                          {overdue(activity.dueDate) ? (
                            <>
                              {' '}
                              <Badge variant="critical">Overdue</Badge>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card accent="red">
            <CardHead title="Open issues">
              <span className="count-pill">{work.issues.length}</span>
            </CardHead>
            {work.issues.length === 0 ? (
              <Empty title="Nothing open" />
            ) : (
              <div className="table-scroll">
                <table>
                  <tbody>
                    {work.issues.map((issue) => (
                      <tr key={issue.id}>
                        <td>
                          <Link href={`/projects/${issue.projectId}/issues/${issue.id}`}>
                            {issue.title}
                          </Link>
                          <span className="cell-sub">
                            {issue.projectCode} · {issue.projectName}
                          </span>
                        </td>
                        <td className="nowrap">
                          {issue.dueDate ? <DateText value={issue.dueDate} /> : null}
                          {overdue(issue.dueDate) ? (
                            <>
                              {' '}
                              <Badge variant="critical">Overdue</Badge>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
