import {
  canTransitionSubmission,
  type SubmissionAction,
  type SubmissionStatus,
} from '@ecms/contracts';

import { ActionButton, ActionForm, Field, Select, TextArea } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DateText,
  Empty,
  PageHead,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type {
  Milestone,
  Page as ApiPage,
  PlanningActivity,
  Project,
  ProjectMember,
  Submission,
  UserRow,
} from '@/lib/types';

import {
  archiveActivity,
  archiveMilestone,
  createActivity,
  createMilestone,
  createSubmission,
  markMilestoneReached,
  setActivityDone,
  transitionSubmission,
} from './actions';

export const metadata = { title: 'Planning — ECMS' };

const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED_FOR_REVISION: 'Returned for revision',
  WITHDRAWN: 'Withdrawn',
};

/**
 * The named actions, and the word for each — the same shape the project and
 * issue pages use. `approve`, `reject` and `returnForRevision` are decisions
 * and sit behind `planning:approve`; the rest are ordinary editing.
 */
const SUBMISSION_ACTION_DEFS: {
  action: SubmissionAction;
  to: SubmissionStatus;
  label: string;
  decision?: boolean;
  variant?: 'secondary' | 'danger';
}[] = [
  { action: 'submit', to: 'SUBMITTED', label: 'Submit' },
  { action: 'review', to: 'UNDER_REVIEW', label: 'Start review' },
  { action: 'approve', to: 'APPROVED', label: 'Approve', decision: true },
  { action: 'reject', to: 'REJECTED', label: 'Reject', decision: true, variant: 'danger' },
  {
    action: 'returnForRevision',
    to: 'RETURNED_FOR_REVISION',
    label: 'Return for revision',
    decision: true,
  },
  { action: 'withdraw', to: 'WITHDRAWN', label: 'Withdraw', variant: 'danger' },
];

/**
 * Planning — activities, milestones and submissions (docs/phase-2-plan.md).
 *
 * One page for all three, the same shape the project page already gives
 * workstreams and team membership: each is small enough to be a table with an
 * inline add form, not a screen of its own.
 */
export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [project, activities, milestones, submissions, members] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<PlanningActivity>>(`/projects/${id}/planning/activities?pageSize=100`),
    api.get<ApiPage<Milestone>>(`/projects/${id}/planning/milestones?pageSize=100`),
    api.get<ApiPage<Submission>>(`/projects/${id}/planning/submissions?pageSize=100`),
    api.get<ProjectMember[]>(`/projects/${id}/members`),
  ]);

  const users = session.can('user:view')
    ? await api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
    : null;
  const userName = new Map((users?.items ?? []).map((u) => [u.id, u.displayName]));
  const nameFor = (userId: string | null): string | null =>
    userId ? (userName.get(userId) ?? userId) : null;

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('planning:create', id) && !closed;
  const mayEdit = session.can('planning:edit', id) && !closed;
  const mayApprove = session.can('planning:approve', id) && !closed;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Planning' },
        ]}
      />
      <PageHead title="Planning" description={project.name} />

      <div className="stack">
        <Card>
          <CardHead title="Activities" />
          {activities.items.length === 0 ? (
            <Empty title="No activities yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Done</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activities.items.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.name}</td>
                    <td>
                      <Value>{nameFor(activity.assigneeId)}</Value>
                    </td>
                    <td className="nowrap">
                      <DateText value={activity.dueDate} />
                    </td>
                    <td>
                      <Badge>{activity.done ? 'Done' : 'Open'}</Badge>
                    </td>
                    <td className="right">
                      {mayEdit ? (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <ActionButton
                            action={setActivityDone.bind(
                              null,
                              id,
                              activity.id,
                              !activity.done,
                              activity.version,
                            )}
                            label={activity.done ? 'Mark not done' : 'Mark done'}
                          />
                          <ActionButton
                            action={archiveActivity.bind(null, id, activity.id)}
                            label="Archive"
                            variant="danger"
                            confirm={`Archive "${activity.name}"?`}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createActivity} submitLabel="Add activity">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field label="Name" name="name" required />
                  <Select
                    label="Assignee"
                    name="assigneeId"
                    options={members.map((m) => ({
                      value: m.userId,
                      label: nameFor(m.userId) ?? m.userId,
                    }))}
                  />
                  <Field label="Due date" name="dueDate" type="date" />
                </div>
                <TextArea label="Description" name="description" />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHead title="Milestones" />
          {milestones.items.length === 0 ? (
            <Empty title="No milestones yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Target date</th>
                  <th>Reached</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {milestones.items.map((milestone) => (
                  <tr key={milestone.id}>
                    <td>{milestone.name}</td>
                    <td className="nowrap">
                      <DateText value={milestone.targetDate} />
                    </td>
                    <td className="nowrap">
                      {milestone.achievedDate ? (
                        <DateText value={milestone.achievedDate} />
                      ) : (
                        <span className="faint">Not yet</span>
                      )}
                    </td>
                    <td className="right">
                      {mayEdit ? (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {!milestone.achievedDate ? (
                            <ActionButton
                              action={markMilestoneReached.bind(
                                null,
                                id,
                                milestone.id,
                                milestone.version,
                              )}
                              label="Mark reached"
                            />
                          ) : null}
                          <ActionButton
                            action={archiveMilestone.bind(null, id, milestone.id)}
                            label="Archive"
                            variant="danger"
                            confirm={`Archive "${milestone.name}"?`}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createMilestone} submitLabel="Add milestone">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  {/* Named distinctly from the activity form's "Name" field above —
                      both are on this page, and Field's id is derived from name,
                      so two fields called "name" would collide. */}
                  <Field label="Name" name="milestoneName" required />
                  <Field label="Target date" name="targetDate" type="date" />
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHead title="Submissions" />
          {submissions.items.length === 0 ? (
            <Empty title="No submissions yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Authority</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submissions.items.map((submission) => {
                  const available = SUBMISSION_ACTION_DEFS.filter(
                    (candidate) =>
                      canTransitionSubmission(submission.status, candidate.to) &&
                      (candidate.decision ? mayApprove : mayEdit),
                  );
                  return (
                    <tr key={submission.id}>
                      <td className="mono">{submission.reference}</td>
                      <td>{submission.authorityName}</td>
                      <td>
                        <Badge>{SUBMISSION_LABEL[submission.status]}</Badge>
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {available.map((candidate) => (
                            <ActionButton
                              key={candidate.action}
                              action={transitionSubmission.bind(
                                null,
                                id,
                                submission.id,
                                candidate.action,
                                submission.version,
                              )}
                              label={candidate.label}
                              variant={candidate.variant ?? 'secondary'}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createSubmission} submitLabel="Add submission">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field label="Reference" name="reference" required />
                  <Field label="Authority" name="authorityName" required />
                </div>
                <TextArea label="Notes" name="notes" />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
