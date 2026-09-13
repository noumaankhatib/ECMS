import {
  canTransitionSubmission,
  type SubmissionAction,
  type SubmissionStatus,
} from '@ecms/contracts';

import { ActionButton, ActionForm, Field, TextArea } from '@/components/form';
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
  Page as ApiPage,
  Project,
  Submission,
  SubmissionMeeting,
  SubmissionReview,
} from '@/lib/types';

import {
  approveSubmission,
  requestClarification,
  resumeSubmission,
  respondClarification,
  transitionSubmission,
} from '../../actions';

import { createMeeting, createReview, recordMeetingOutcome, recordReviewResponse } from './actions';

export const metadata = { title: 'Submission — ECMS' };

const STATUS_LABEL: Record<SubmissionStatus, string> = {
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
 * The ordinary transitions — everything except `approve` (needs a permit
 * reference, so it gets its own `ActionForm` below) and `resume` (not a
 * fixed-target action at all, docs/phase-6-plan.md §4).
 */
const ACTIONS: {
  action: SubmissionAction;
  to: SubmissionStatus;
  label: string;
  decision?: boolean;
  variant?: 'secondary' | 'danger';
}[] = [
  { action: 'submit', to: 'SUBMITTED', label: 'Submit' },
  { action: 'review', to: 'UNDER_REVIEW', label: 'Start review' },
  { action: 'reject', to: 'REJECTED', label: 'Reject', decision: true, variant: 'danger' },
  {
    action: 'returnForRevision',
    to: 'RETURNED_FOR_REVISION',
    label: 'Return for revision',
    decision: true,
  },
  { action: 'withdraw', to: 'WITHDRAWN', label: 'Withdraw', variant: 'danger' },
  { action: 'halt', to: 'HALTED', label: 'Halt' },
  { action: 'cancel', to: 'CANCELLED', label: 'Cancel', variant: 'danger' },
];

/**
 * A submission's own page (docs/phase-6-plan.md §4/§8, Step 28) — the
 * reviews and meetings a real authority application accumulates need more
 * room than the shared Planning page's inline table gives Activities and
 * Milestones, the same reason Drawings and Site Visits already got their
 * own detail pages.
 */
export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const session = await requireSession();
  const { id, submissionId } = await params;

  const [project, submission, reviews, meetings] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<Submission>(`/projects/${id}/planning/submissions/${submissionId}`),
    api.get<ApiPage<SubmissionReview>>(
      `/projects/${id}/planning/submissions/${submissionId}/reviews?pageSize=100`,
    ),
    api.get<ApiPage<SubmissionMeeting>>(
      `/projects/${id}/planning/submissions/${submissionId}/meetings?pageSize=100`,
    ),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('planning:create', id) && !closed;
  const mayEdit = session.can('planning:edit', id) && !closed;
  const mayApprove = session.can('planning:approve', id) && !closed;

  const available = ACTIONS.filter(
    (candidate) =>
      canTransitionSubmission(submission.status, candidate.to) &&
      (candidate.decision ? mayApprove : mayEdit),
  );
  const mayResume = mayEdit && submission.status === 'HALTED';
  const mayApproveNow = mayApprove && canTransitionSubmission(submission.status, 'APPROVED');
  const mayRequestClarification =
    mayEdit && !submission.clarificationRequested && submission.status === 'UNDER_REVIEW';
  const mayRespondClarification = mayEdit && submission.clarificationRequested;

  const orderedReviews = [...reviews.items].sort(
    (a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime(),
  );
  const orderedMeetings = [...meetings.items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/planning`, label: 'Planning' },
          { label: submission.reference },
        ]}
      />
      <PageHead title={submission.reference} description={submission.authorityName}>
        <Badge>{STATUS_LABEL[submission.status]}</Badge>
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          {available.length > 0 || mayResume || mayApproveNow ? (
            <Card>
              <CardHead title="Status" />
              <CardBody>
                <div className="row">
                  {available.map((candidate) => (
                    <ActionButton
                      key={candidate.action}
                      action={transitionSubmission.bind(
                        null,
                        id,
                        submissionId,
                        candidate.action,
                        submission.version,
                      )}
                      label={candidate.label}
                      variant={candidate.variant ?? 'secondary'}
                    />
                  ))}
                  {mayResume ? (
                    <ActionButton
                      action={resumeSubmission.bind(null, id, submissionId, submission.version)}
                      label="Resume"
                    />
                  ) : null}
                </div>
                <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                  Only the moves legal from{' '}
                  <strong>{STATUS_LABEL[submission.status].toLowerCase()}</strong> are offered. The
                  server checks again regardless.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {mayApproveNow ? (
            <Card>
              <CardHead title="Approve" />
              <CardBody>
                <ActionForm action={approveSubmission} submitLabel="Approve">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="id" value={submissionId} />
                  <input type="hidden" name="version" value={submission.version} />
                  <div className="form-grid">
                    <Field
                      label="Permit reference"
                      name="permitReference"
                      defaultValue={submission.permitReference}
                      hint="Required unless one is already on record — the server checks regardless of what this form allows through."
                    />
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {mayRequestClarification || mayRespondClarification ? (
            <Card>
              <CardHead title="Clarification" />
              <CardBody>
                {submission.clarificationRequested ? (
                  <>
                    <p className="hint">
                      Requested <DateText value={submission.clarificationRequestedAt} />. Record the
                      authority's response below.
                    </p>
                    {mayRespondClarification ? (
                      <ActionForm action={respondClarification} submitLabel="Record response">
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="id" value={submissionId} />
                        <input type="hidden" name="version" value={submission.version} />
                        <TextArea label="Response" name="response" />
                      </ActionForm>
                    ) : null}
                  </>
                ) : (
                  <ActionButton
                    action={requestClarification.bind(null, id, submissionId, submission.version)}
                    label="Request clarification"
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Reviews" />
            {orderedReviews.length === 0 ? (
              <Empty title="No reviews logged yet" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reviewer</th>
                    <th>Comments</th>
                    <th>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedReviews.map((review) => (
                    <tr key={review.id}>
                      <td className="nowrap">
                        <DateText value={review.reviewDate} />
                      </td>
                      <td>
                        <Value>{review.reviewerName}</Value>
                      </td>
                      <td>
                        <Value>{review.comments}</Value>
                      </td>
                      <td>
                        {review.responseText ? (
                          <Value>{review.responseText}</Value>
                        ) : mayEdit ? (
                          <ActionForm action={recordReviewResponse} submitLabel="Record response">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="submissionId" value={submissionId} />
                            <input type="hidden" name="id" value={review.id} />
                            <input type="hidden" name="version" value={review.version} />
                            <TextArea label="Response" name="responseText" />
                          </ActionForm>
                        ) : (
                          <span className="faint">Awaiting response</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mayCreate ? (
              <CardBody>
                <ActionForm action={createReview} submitLabel="Log review">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <div className="form-grid">
                    <Field label="Review date" name="reviewDate" type="date" required />
                    <Field label="Reviewer" name="reviewerName" />
                    <Field label="Response due" name="responseDueAt" type="date" />
                  </div>
                  <TextArea label="Comments" name="comments" />
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHead title="Meetings" />
            {orderedMeetings.length === 0 ? (
              <Empty title="No meetings logged yet" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th>Required</th>
                    <th>Purpose</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedMeetings.map((meeting) => (
                    <tr key={meeting.id}>
                      <td className="nowrap">
                        <DateText value={meeting.meetingAt} />
                      </td>
                      <td>
                        <Badge>{meeting.required ? 'Required' : 'Optional'}</Badge>
                      </td>
                      <td>
                        <Value>{meeting.purpose}</Value>
                      </td>
                      <td>
                        {meeting.heldAt ? (
                          <Value>{meeting.outcome}</Value>
                        ) : mayEdit ? (
                          <ActionForm action={recordMeetingOutcome} submitLabel="Record outcome">
                            <input type="hidden" name="projectId" value={id} />
                            <input type="hidden" name="submissionId" value={submissionId} />
                            <input type="hidden" name="id" value={meeting.id} />
                            <input type="hidden" name="version" value={meeting.version} />
                            <TextArea label="Outcome" name="outcome" />
                          </ActionForm>
                        ) : (
                          <span className="faint">Not yet held</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mayCreate ? (
              <CardBody>
                <ActionForm action={createMeeting} submitLabel="Log meeting">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <div className="form-grid">
                    <Field label="Scheduled for" name="meetingAt" type="datetime-local" />
                    <label className="field" htmlFor="required">
                      <span>Required</span>
                      <input id="required" type="checkbox" name="required" />
                    </label>
                  </div>
                  <TextArea label="Purpose" name="purpose" />
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Reference</dt>
              <dd className="mono">{submission.reference}</dd>
              <dt>Authority</dt>
              <dd>{submission.authorityName}</dd>
              <dt>Department</dt>
              <dd>
                <Value>{DEPARTMENT_LABEL[submission.department] ?? submission.department}</Value>
              </dd>
              <dt>Pending with</dt>
              <dd>
                <Value>{submission.pendingWith}</Value>
              </dd>
              <dt>Permit reference</dt>
              <dd>
                <Value>{submission.permitReference}</Value>
              </dd>
              {submission.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{submission.notes}</dd>
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
