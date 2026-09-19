import { ActionForm, DateRangeFields, Field, Select, TextArea } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DateText,
  Empty,
  PageHead,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Page as ApiPage, Project, SupervisionAgreement } from '@/lib/types';

import { createAgreement, renewAgreement } from '../actions';

export const metadata = { title: 'Supervision agreements — ECMS' };

const TYPE_LABEL: Record<string, string> = {
  MONTHLY: 'Monthly',
  ON_CALL: 'On call',
};

/**
 * Supervision agreements (docs/phase-7-plan.md) — the commercial arrangement
 * a project's site visits happen under. A project may hold more than one
 * over its life (renewals, or a changed arrangement), so this is a list, not
 * a single form on the project page — the same reason Drawings/Site Visits
 * got their own page rather than living inline.
 */
export default async function SupervisionAgreementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [project, agreements] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<ApiPage<SupervisionAgreement>>(`/projects/${id}/supervision/agreements?pageSize=100`),
  ]);

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('supervision:create', id) && !closed;
  const mayEdit = session.can('supervision:edit', id) && !closed;

  const ordered = [...agreements.items].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  // The one agreement, if any, still eligible to renew — not yet renewed
  // itself. Renewing produces a new, linked row rather than editing this
  // one, so it gets its own form beneath the table, the same way Proposals'
  // "Convert to project" is a distinct card rather than an inline edit.
  const renewable = ordered.find((agreement) => !agreement.renewedAt);

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/supervision`, label: 'Supervision' },
          { label: 'Agreements' },
        ]}
      />
      <PageHead title="Supervision agreements" description={project.name} />

      <div className="stack">
        <Card>
          <CardHead title="History" />
          {ordered.length === 0 ? (
            <Empty title="No agreements recorded yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Visits used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((agreement) => (
                  <tr key={agreement.id}>
                    <td>{TYPE_LABEL[agreement.type] ?? agreement.type}</td>
                    <td className="nowrap">
                      <DateText value={agreement.startDate} /> –{' '}
                      {agreement.endDate ? (
                        <DateText value={agreement.endDate} />
                      ) : (
                        <span className="faint">ongoing</span>
                      )}
                    </td>
                    <td>{agreement.amount}</td>
                    <td>
                      {agreement.visitsUsed} / {agreement.visitsAllowed}
                    </td>
                    <td>
                      <Badge>{agreement.renewedAt ? 'Renewed' : 'Active'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mayCreate ? (
            <CardBody>
              <ActionForm action={createAgreement} submitLabel="Record agreement">
                <input type="hidden" name="projectId" value={id} />
                <div className="form-grid">
                  <Select
                    label="Type"
                    name="type"
                    required
                    options={[
                      { value: 'MONTHLY', label: 'Monthly' },
                      { value: 'ON_CALL', label: 'On call' },
                    ]}
                  />
                  <Field label="Visits allowed" name="visitsAllowed" required />
                  <Field label="Amount" name="amount" required />
                  <DateRangeFields
                    startLabel="Start date"
                    startName="startDate"
                    startRequired
                    endLabel="End date"
                    endName="endDate"
                  />
                </div>
                <TextArea label="Notes" name="notes" />
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>

        {mayEdit && renewable ? (
          <Card>
            <CardHead title="Renew" />
            <CardBody>
              <p className="hint">
                Creates a new agreement linked to this one and marks it renewed. Terms default to
                this agreement's own, and are overridable below.
              </p>
              <ActionForm action={renewAgreement} submitLabel="Renew">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="id" value={renewable.id} />
                <input type="hidden" name="version" value={renewable.version} />
                <div className="form-grid">
                  <DateRangeFields
                    startLabel="New start date"
                    startName="startDate"
                    startHint="Defaults to the day after this agreement's end date."
                    endLabel="New end date"
                    endName="endDate"
                  />
                  <Field
                    label="Visits allowed"
                    name="visitsAllowed"
                    defaultValue={String(renewable.visitsAllowed)}
                  />
                  <Field label="Amount" name="amount" defaultValue={renewable.amount} />
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
