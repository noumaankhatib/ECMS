import {
  canTransitionApproval,
  MODIFICATION_IMPACT_AREAS,
  type ApprovalStatus,
  type ModificationAction,
} from '@ecms/contracts';

import { ProjectContext } from '@/components/context-strip';
import { ActionButton, ActionForm, Field, Select, TextArea } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  Empty,
  PageHead,
  Pagination,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type {
  Drawing,
  DrawingRevision,
  Modification,
  Observation,
  Page as ApiPage,
  Project,
  SiteVisit,
} from '@/lib/types';

import { createModification, transitionModification } from './actions';

export const metadata = { title: 'Modifications — ECMS' };

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED_FOR_REVISION: 'Returned for revision',
};

const IMPACT_AREA_LABEL: Record<string, string> = {
  ARCHITECTURE: 'Architecture',
  STRUCTURAL: 'Structural',
  MEP: 'MEP',
};

/**
 * The named actions, and the word for each — the same shape the Drawings
 * page uses for a `DrawingRevision`. `approve`, `reject` and
 * `returnForRevision` are decisions and sit behind `planning:approve`;
 * `submit` and `review` sit behind `planning:edit`, the same split
 * `SubmissionController` already draws (docs/phase-8-plan.md §6).
 */
const ACTIONS: {
  action: ModificationAction;
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
 * Client-requested mid-construction changes (docs/phase-8-plan.md), tracked
 * from request to decision through the shared `ApprovalStatus` machine — no
 * dedicated detail page, since a modification carries no child records the
 * way a Submission's reviews/meetings do (docs/PROGRESS.md's Phase 2 note on
 * "no dedicated edit page" applies here for the same reason).
 */
export default async function ModificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const pageNumber = Math.max(1, Number(query.page) || 1);

  const [project, modifications] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<Modification>>(
      `/projects/${id}/modifications?page=${pageNumber}&pageSize=${PAGE_SIZE}`,
    ),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('planning:create', id) && !closed;

  // The "raised against" pickers list this project's own revisions and
  // observations, so nobody has to paste an id. Only loaded when the form shows.
  const [revisionOptions, observationOptions] = mayCreate
    ? await Promise.all([loadRevisionOptions(id), loadObservationOptions(id)])
    : [[], []];
  const mayEdit = session.can('planning:edit', id) && !closed;
  const mayApprove = session.can('planning:approve', id) && !closed;

  const ordered = [...modifications.items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function buildHref(targetPage: number): string {
    return `/projects/${id}/modifications?page=${targetPage}`;
  }

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { label: 'Modifications' },
        ]}
      />
      <PageHead title="Modifications" description={project.name} />

      <ProjectContext project={project} session={session} />

      <div className="stack">
        <Card>
          {ordered.length === 0 ? (
            <Empty title="No modifications recorded yet" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Area</th>
                    <th>Cost impact</th>
                    <th>Time impact</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((modification) => {
                    const available = ACTIONS.filter(
                      (candidate) =>
                        canTransitionApproval(modification.status, candidate.to) &&
                        (candidate.decision ? mayApprove : mayEdit),
                    );
                    return (
                      <tr key={modification.id}>
                        <td>{modification.requestText}</td>
                        <td>
                          <Badge>{IMPACT_AREA_LABEL[modification.impactArea]}</Badge>
                        </td>
                        <td>
                          <Value>{modification.costImpact}</Value>
                        </td>
                        <td>
                          <Value>{modification.timeImpact}</Value>
                        </td>
                        <td>
                          <Badge>{STATUS_LABEL[modification.status]}</Badge>
                        </td>
                        <td className="right">
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {available.map((candidate) => (
                              <ActionButton
                                key={candidate.action}
                                action={transitionModification.bind(
                                  null,
                                  id,
                                  modification.id,
                                  candidate.action,
                                  modification.version,
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
            </div>
          )}
          {ordered.length > 0 ? (
            <CardBody>
              <Pagination
                page={pageNumber}
                pageSize={PAGE_SIZE}
                total={modifications.total}
                buildHref={buildHref}
              />
            </CardBody>
          ) : null}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createModification} submitLabel="Record modification">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Select
                    label="Impact area"
                    name="impactArea"
                    required
                    options={MODIFICATION_IMPACT_AREAS.map((area) => ({
                      value: area,
                      label: IMPACT_AREA_LABEL[area] ?? area,
                    }))}
                  />
                  <Field label="Cost impact" name="costImpact" hint="e.g. +OMR 1,200" />
                  <Field label="Time impact" name="timeImpact" hint="e.g. +1 week" />
                  <Select
                    label="Drawing revision"
                    name="drawingRevisionId"
                    options={revisionOptions}
                    hint="Optional — if this change was raised against a specific revision."
                  />
                  <Select
                    label="Site visit observation"
                    name="observationId"
                    options={observationOptions}
                    hint="Optional — if this change was raised from a site visit observation."
                  />
                </div>
                <TextArea label="What the client is asking for" name="requestText" />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}

interface PickOption {
  value: string;
  label: string;
}

async function loadRevisionOptions(projectId: string): Promise<PickOption[]> {
  const drawings = await api
    .get<ApiPage<Drawing>>(`/projects/${projectId}/drawings?pageSize=100`)
    .catch(() => null);
  const perDrawing = await Promise.all(
    (drawings?.items ?? []).map(async (drawing) => {
      const revisions = await api
        .get<ApiPage<DrawingRevision>>(
          `/projects/${projectId}/drawings/${drawing.id}/revisions?pageSize=100`,
        )
        .catch(() => null);
      return (revisions?.items ?? []).map((revision) => ({
        value: revision.id,
        label: `${drawing.number} · Rev ${revision.revisionCode} — ${drawing.title}`,
      }));
    }),
  );
  return perDrawing.flat();
}

async function loadObservationOptions(projectId: string): Promise<PickOption[]> {
  const visits = await api
    .get<ApiPage<SiteVisit>>(`/projects/${projectId}/supervision/site-visits?pageSize=100`)
    .catch(() => null);
  const perVisit = await Promise.all(
    (visits?.items ?? []).map(async (visit) => {
      const observations = await api
        .get<ApiPage<Observation>>(
          `/projects/${projectId}/supervision/site-visits/${visit.id}/observations?pageSize=100`,
        )
        .catch(() => null);
      const day = visit.visitDate.slice(0, 10);
      return (observations?.items ?? []).map((observation) => ({
        value: observation.id,
        label: `${day} — ${observation.description.slice(0, 70)}`,
      }));
    }),
  );
  return perVisit.flat();
}
