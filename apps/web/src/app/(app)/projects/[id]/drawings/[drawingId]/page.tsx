import {
  canTransitionApproval,
  type ApprovalStatus,
  type DrawingRevisionAction,
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
import type { Drawing, DrawingRevision, Page as ApiPage, Project } from '@/lib/types';

import { createRevision, transitionRevision } from './actions';

export const metadata = { title: 'Drawing — ECMS' };

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED_FOR_REVISION: 'Returned for revision',
};

/**
 * The named actions, and the word for each — the same shape the planning
 * page uses for Submission. `approve`, `reject` and `returnForRevision` are
 * decisions and sit behind `drawing:approve`; `submit` and `review` sit
 * behind `drawing:create`, the same permission that creates a revision at
 * all (docs/phase-3-plan.md §5 — there is no `drawing:edit`).
 */
const ACTIONS: {
  action: DrawingRevisionAction;
  to: ApprovalStatus;
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
];

/**
 * The revision timeline. Append-only — the strictest invariant in the system
 * (docs/phase-3-plan.md §5) — so this page only ever adds a row; nothing
 * here can edit or remove one. The one row with no `supersededAt` is marked
 * "Current"; once a later revision exists, the buttons for the superseded
 * row are simply not offered any more (there is nothing legal left to do to
 * it), which is why `available` is computed per row rather than once.
 */
export default async function DrawingPage({
  params,
}: {
  params: Promise<{ id: string; drawingId: string }>;
}) {
  const session = await requireSession();
  const { id, drawingId } = await params;

  const [project, drawing, revisions] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<Drawing>(`/projects/${id}/drawings/${drawingId}`),
    api.get<ApiPage<DrawingRevision>>(
      `/projects/${id}/drawings/${drawingId}/revisions?pageSize=100`,
    ),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('drawing:create', id) && !closed;
  const mayApprove = session.can('drawing:approve', id) && !closed;

  const ordered = [...revisions.items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/drawings`, label: 'Drawings' },
          { label: drawing.number },
        ]}
      />
      <PageHead title={drawing.number} description={drawing.title} />

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Revisions" />
            {ordered.length === 0 ? (
              <Empty title="No revisions uploaded yet" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Current</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((revision) => {
                    const available = ACTIONS.filter(
                      (candidate) =>
                        canTransitionApproval(revision.status, candidate.to) &&
                        (candidate.decision ? mayApprove : mayCreate),
                    );
                    return (
                      <tr key={revision.id}>
                        <td className="mono">{revision.revisionCode}</td>
                        <td>
                          <Badge>{STATUS_LABEL[revision.status]}</Badge>
                        </td>
                        <td>
                          {revision.supersededAt ? (
                            <span className="faint">Superseded</span>
                          ) : (
                            <Badge>Current</Badge>
                          )}
                        </td>
                        <td className="nowrap">
                          <DateText value={revision.createdAt} />
                        </td>
                        <td className="right">
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {available.map((candidate) => (
                              <ActionButton
                                key={candidate.action}
                                action={transitionRevision.bind(
                                  null,
                                  id,
                                  drawingId,
                                  revision.id,
                                  candidate.action,
                                  revision.version,
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
                <ActionForm action={createRevision} submitLabel="Upload revision">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="drawingId" value={drawingId} />
                  <div className="form-grid">
                    <Field
                      label="Revision code"
                      name="revisionCode"
                      required
                      hint="P1, C1, Rev A…"
                    />
                    <Field
                      label="File reference"
                      name="fileId"
                      hint="No Google Drive account is connected yet — leave blank unless you already have one."
                    />
                  </div>
                  <TextArea label="Notes" name="notes" />
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Number</dt>
              <dd className="mono">{drawing.number}</dd>
              <dt>Title</dt>
              <dd>{drawing.title}</dd>
              <dt>Current revision</dt>
              <dd>
                <Value>
                  {ordered.find((r) => r.id === drawing.currentRevisionId)?.revisionCode}
                </Value>
              </dd>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
