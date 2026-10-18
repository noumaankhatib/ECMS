import type { SubmissionStatus } from '@ecms/contracts';
import Link from 'next/link';

import { ProjectContext } from '@/components/context-strip';
import { EntityCombobox } from '@/components/entity-combobox';
import { ActionButton, ActionForm, DateField, Field, Select, TextArea } from '@/components/form';
import { SuggestField } from '@/components/suggest-field';
import { TemplateChecklist } from '@/components/template-checklist';
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
import { AUTHORITIES, PENDING_WITH } from '@/lib/suggestions';
import type {
  Milestone,
  Page as ApiPage,
  PlanningActivity,
  PlanningTemplateItem,
  Project,
  Submission,
} from '@/lib/types';
import { loadUserNames } from '@/lib/user-names';

import {
  applyPlanningTemplate,
  archiveActivity,
  archiveMilestone,
  createActivity,
  createMilestone,
  createSubmission,
  markMilestoneReached,
  setActivityDone,
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
  HALTED: 'Halted',
  CANCELLED: 'Cancelled',
};

const DEPARTMENT_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  HOUSING: 'Housing',
};

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

  const [project, activities, milestones, submissions] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<PlanningActivity>>(`/projects/${id}/planning/activities?pageSize=100`),
    api.get<ApiPage<Milestone>>(`/projects/${id}/planning/milestones?pageSize=100`),
    api.get<ApiPage<Submission>>(`/projects/${id}/planning/submissions?pageSize=100`),
  ]);

  const userName = await loadUserNames(activities.items.map((a) => a.assigneeId));
  const nameFor = (userId: string | null): string | null =>
    userId ? (userName.get(userId) ?? userId) : null;

  const templates = await api
    .get<PlanningTemplateItem[]>('/planning-templates')
    .catch(() => [] as PlanningTemplateItem[]);
  const activityTemplates = templates.filter((t) => t.kind === 'ACTIVITY').map((t) => t.name);
  const milestoneTemplates = templates.filter((t) => t.kind === 'MILESTONE').map((t) => t.name);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('planning:create', id) && !closed;
  const mayEdit = session.can('planning:edit', id) && !closed;

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

      <ProjectContext project={project} session={session} />

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
              <TemplateChecklist
                projectId={id}
                kind="ACTIVITY"
                title="Add standard activities"
                items={activityTemplates}
                existing={activities.items.map((a) => a.name)}
                action={applyPlanningTemplate}
              />
              <ActionForm action={createActivity} submitLabel="Add activity">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <SuggestField
                    label="Name"
                    name="name"
                    required
                    suggestions={[...activities.items.map((a) => a.name), ...activityTemplates]}
                  />
                  <EntityCombobox
                    label="Assignee"
                    name="assigneeId"
                    searchUrl="/lookup/users/search?browse=true&activeOnly=true"
                    browseOnFocus
                    placeholder="Select or search a person"
                  />
                  <DateField label="Due date" name="dueDate" />
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
              <TemplateChecklist
                projectId={id}
                kind="MILESTONE"
                title="Add standard milestones"
                items={milestoneTemplates}
                existing={milestones.items.map((m) => m.name)}
                action={applyPlanningTemplate}
              />
              <ActionForm action={createMilestone} submitLabel="Add milestone">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  {/* Named distinctly from the activity form's "Name" field above —
                      both are on this page, and Field's id is derived from name,
                      so two fields called "name" would collide. */}
                  <SuggestField
                    label="Name"
                    name="milestoneName"
                    required
                    suggestions={[...milestones.items.map((m) => m.name), ...milestoneTemplates]}
                  />
                  <DateField label="Target date" name="targetDate" />
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
                  <th>Department</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submissions.items.map((submission) => (
                  <tr key={submission.id}>
                    <td className="mono">
                      <Link href={`/projects/${id}/planning/submissions/${submission.id}`}>
                        {submission.reference}
                      </Link>
                    </td>
                    <td>{submission.authorityName}</td>
                    <td>
                      <Value>
                        {DEPARTMENT_LABEL[submission.department] ?? submission.department}
                      </Value>
                    </td>
                    <td>
                      <Badge>{SUBMISSION_LABEL[submission.status]}</Badge>
                      {submission.clarificationRequested ? (
                        <>
                          {' '}
                          <span className="badge">Clarification pending</span>
                        </>
                      ) : null}
                    </td>
                    <td className="right">
                      <Link
                        href={`/projects/${id}/planning/submissions/${submission.id}`}
                        className="button button--small button--secondary"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createSubmission} submitLabel="Add submission">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Field label="Reference" name="reference" required />
                  <SuggestField
                    label="Authority"
                    name="authorityName"
                    required
                    suggestions={[...submissions.items.map((s) => s.authorityName), ...AUTHORITIES]}
                  />
                  <Select
                    label="Department"
                    name="department"
                    options={[
                      { value: 'PLANNING', label: 'Planning' },
                      { value: 'HOUSING', label: 'Housing' },
                    ]}
                    defaultValue="PLANNING"
                  />
                  <SuggestField
                    label="Pending with"
                    name="pendingWith"
                    suggestions={[
                      ...submissions.items.flatMap((s) => (s.pendingWith ? [s.pendingWith] : [])),
                      ...PENDING_WITH,
                    ]}
                    hint="Who currently holds this — the client, the authority, us…"
                  />
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
