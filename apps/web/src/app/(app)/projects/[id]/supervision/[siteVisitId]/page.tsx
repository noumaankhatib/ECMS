import Link from 'next/link';

import { ActionButton, ActionForm, Field, Select, TextArea } from '@/components/form';
import {
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
  Instruction,
  Observation,
  Page as ApiPage,
  Project,
  ProjectMember,
  SiteVisit,
  UserRow,
} from '@/lib/types';

import { createInstruction, createObservation, markInstructionActioned } from './actions';

export const metadata = { title: 'Site visit — ECMS' };

export default async function SiteVisitPage({
  params,
}: {
  params: Promise<{ id: string; siteVisitId: string }>;
}) {
  const session = await requireSession();
  const { id, siteVisitId } = await params;

  const [project, visit, observations, instructions, members] = await Promise.all([
    api.get<Project>(`/projects/${id}`),
    api.get<SiteVisit>(`/projects/${id}/supervision/site-visits/${siteVisitId}`),
    api.get<ApiPage<Observation>>(
      `/projects/${id}/supervision/site-visits/${siteVisitId}/observations?pageSize=100`,
    ),
    api.get<ApiPage<Instruction>>(
      `/projects/${id}/supervision/site-visits/${siteVisitId}/instructions?pageSize=100`,
    ),
    api.get<ProjectMember[]>(`/projects/${id}/members`),
  ]);

  const users = session.can('user:view')
    ? await api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
    : null;
  const userName = new Map((users?.items ?? []).map((u) => [u.id, u.displayName]));
  const nameFor = (userId: string | null): string | null =>
    userId ? (userName.get(userId) ?? userId) : null;

  const closed = project.status === 'CLOSED';
  const mayCreate = session.can('supervision:create', id) && !closed;
  const mayEdit = session.can('supervision:edit', id) && !closed;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${id}`, label: project.code },
          { href: `/projects/${id}/supervision`, label: 'Supervision' },
          { label: 'Site visit' },
        ]}
      />
      <PageHead title="Site visit" description={project.name} />

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Observations" />
            {observations.items.length === 0 ? (
              <Empty title="Nothing recorded yet" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {observations.items.map((observation) => (
                    <tr key={observation.id}>
                      <td>{observation.description}</td>
                      <td>
                        <Value>{observation.category}</Value>
                      </td>
                      <td className="right">
                        {session.can('issue:create', id) && !closed ? (
                          <Link
                            href={`/projects/${id}/issues/new?observationId=${observation.id}`}
                            className="button button--small button--secondary"
                          >
                            Raise issue
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mayCreate ? (
              <CardBody>
                <ActionForm action={createObservation} submitLabel="Record observation">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="siteVisitId" value={siteVisitId} />
                  <TextArea label="Description" name="description" />
                  <Field label="Category" name="category" />
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHead title="Instructions" />
            {instructions.items.length === 0 ? (
              <Empty title="Nothing issued yet" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Directive</th>
                    <th>Assignee</th>
                    <th>Due</th>
                    <th>Actioned</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {instructions.items.map((instruction) => (
                    <tr key={instruction.id}>
                      <td>{instruction.directiveText}</td>
                      <td>
                        <Value>{nameFor(instruction.assigneeId)}</Value>
                      </td>
                      <td className="nowrap">
                        <DateText value={instruction.dueDate} />
                      </td>
                      <td className="nowrap">
                        {instruction.actionedAt ? (
                          <DateText value={instruction.actionedAt} />
                        ) : (
                          <span className="faint">Not yet</span>
                        )}
                      </td>
                      <td className="right">
                        {mayEdit && !instruction.actionedAt ? (
                          <ActionButton
                            action={markInstructionActioned.bind(
                              null,
                              id,
                              siteVisitId,
                              instruction.id,
                              instruction.version,
                            )}
                            label="Mark actioned"
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mayCreate ? (
              <CardBody>
                <ActionForm action={createInstruction} submitLabel="Issue instruction">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="siteVisitId" value={siteVisitId} />
                  <TextArea label="Directive" name="directiveText" />
                  <div className="form-grid">
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
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHead title="Details" />
          <CardBody>
            <dl className="definition">
              <dt>Date</dt>
              <dd>
                <DateText value={visit.visitDate} />
              </dd>
              <dt>Attendees</dt>
              <dd>
                <Value>{visit.attendees}</Value>
              </dd>
              {visit.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{visit.notes}</dd>
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
