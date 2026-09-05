import {
  PROJECT_TRANSITIONS,
  ROLE_DEFINITIONS,
  canTransitionWorkstream,
  type ProjectAction,
  type ProjectStatus,
} from '@ecms/contracts';
import Link from 'next/link';

import { ActionButton, ActionForm, Select } from '@/components/form';
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHead,
  DateText,
  Empty,
  PageHead,
  StatusBadge,
  Value,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type {
  Client,
  Page as ApiPage,
  Project,
  ProjectMember,
  Property,
  UserRow,
  Workstream,
} from '@/lib/types';

import { addMember, removeMember, transitionProject, transitionWorkstream } from '../actions';

export const metadata = { title: 'Project — ECMS' };

/**
 * The named actions, and the word for each.
 *
 * Which of them is OFFERED comes from PROJECT_TRANSITIONS in shared contracts —
 * the same table the API checks against. The interface therefore cannot drift
 * into showing a button for a move the server would refuse, because both are
 * reading one definition.
 */
const ACTIONS: { action: ProjectAction; to: ProjectStatus; label: string; confirm?: string }[] = [
  { action: 'activate', to: 'ACTIVE', label: 'Activate' },
  { action: 'hold', to: 'ON_HOLD', label: 'Put on hold' },
  { action: 'complete', to: 'COMPLETED', label: 'Mark complete' },
  {
    action: 'close',
    to: 'CLOSED',
    label: 'Close',
    confirm: 'Close this project? Closed is final — nothing can be changed afterwards.',
  },
];

const WORKSTREAM_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

const WORKSTREAM_NEXT: Record<string, { to: string; label: string }[]> = {
  NOT_STARTED: [{ to: 'IN_PROGRESS', label: 'Start' }],
  IN_PROGRESS: [
    { to: 'ON_HOLD', label: 'Hold' },
    { to: 'COMPLETED', label: 'Complete' },
  ],
  ON_HOLD: [{ to: 'IN_PROGRESS', label: 'Resume' }],
  COMPLETED: [],
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const project = await api.get<Project>(`/projects/${id}`);
  const [members, workstreams] = await Promise.all([
    api.get<ProjectMember[]>(`/projects/${id}/members`),
    api.get<Workstream[]>(`/projects/${id}/workstreams`),
  ]);

  // Only fetched when this person may see them. A Planner on the project can
  // read it without being able to read the client list.
  const [client, property, users] = await Promise.all([
    session.can('client:view')
      ? api.get<Client>(`/clients/${project.clientId}`).catch(() => null)
      : null,
    session.can('property:view')
      ? api.get<Property>(`/properties/${project.propertyId}`).catch(() => null)
      : null,
    session.can('user:view')
      ? api.get<ApiPage<UserRow>>('/users?pageSize=100').catch(() => null)
      : null,
  ]);

  const userName = new Map((users?.items ?? []).map((u) => [u.id, u.displayName]));
  const roleName = new Map(ROLE_DEFINITIONS.map((r) => [r.code as string, r.name]));

  const closed = project.status === 'CLOSED';
  const mayEdit = session.can('project:edit', id) && !closed;
  const mayClose = session.can('project:close', id) && !closed;
  const mayManageMembers = session.can('project:manage_members', id) && !closed;

  const legal = PROJECT_TRANSITIONS[project.status];
  const available = ACTIONS.filter(
    (candidate) =>
      (legal as readonly ProjectStatus[]).includes(candidate.to) &&
      (candidate.action === 'close' ? mayClose : mayEdit),
  );

  const onProject = new Set(members.map((m) => m.userId));
  const addable = (users?.items ?? []).filter(
    (user) => !onProject.has(user.id) && user.status === 'ACTIVE',
  );

  return (
    <>
      <Breadcrumb items={[{ href: '/projects', label: 'Projects' }, { label: project.code }]} />
      <PageHead title={project.name} description={project.code}>
        <StatusBadge status={project.status} />
        {mayEdit ? (
          <Link href={`/projects/${id}/edit`} className="button button--secondary">
            Edit
          </Link>
        ) : null}
      </PageHead>

      {closed ? (
        <div className="alert" style={{ marginBottom: 'var(--space-4)' }} role="status">
          This project is closed. It is kept as the record of the work and cannot be changed.
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {(project.type === 'PLANNING' || project.type === 'BOTH') &&
        session.can('planning:view', id) ? (
          <Link href={`/projects/${id}/planning`} className="button button--secondary">
            Planning
          </Link>
        ) : null}
        {(project.type === 'SUPERVISION' || project.type === 'BOTH') &&
        session.can('supervision:view', id) ? (
          <Link href={`/projects/${id}/supervision`} className="button button--secondary">
            Supervision
          </Link>
        ) : null}
        {session.can('issue:view', id) ? (
          <Link href={`/projects/${id}/issues`} className="button button--secondary">
            Issues
          </Link>
        ) : null}
        {session.can('drawing:view', id) ? (
          <Link href={`/projects/${id}/drawings`} className="button button--secondary">
            Drawings
          </Link>
        ) : null}
        {session.can('document:view', id) ? (
          <Link href={`/projects/${id}/documents`} className="button button--secondary">
            Documents
          </Link>
        ) : null}
      </div>

      <div className="grid-2">
        <div className="stack">
          {available.length > 0 ? (
            <Card>
              <CardHead title="Status" />
              <CardBody>
                <div className="row">
                  {available.map((candidate) => (
                    <ActionButton
                      key={candidate.action}
                      action={transitionProject.bind(null, id, candidate.action, project.version)}
                      label={candidate.label}
                      variant={candidate.action === 'close' ? 'danger' : 'secondary'}
                      {...(candidate.confirm ? { confirm: candidate.confirm } : {})}
                    />
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
                  Only the moves that are legal from{' '}
                  <strong>{project.status.toLowerCase().replace('_', ' ')}</strong> are offered. The
                  server checks again regardless.
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Workstreams" />
            {workstreams.length === 0 ? (
              <Empty title="No workstreams">Unusual — a project opens with at least one.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Work</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {workstreams.map((workstream) => (
                    <tr key={workstream.id}>
                      <td>{workstream.name}</td>
                      <td>
                        <Badge>{WORKSTREAM_LABEL[workstream.status] ?? workstream.status}</Badge>
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {mayEdit
                            ? (WORKSTREAM_NEXT[workstream.status] ?? [])
                                .filter((next) =>
                                  canTransitionWorkstream(
                                    workstream.status,
                                    next.to as Workstream['status'],
                                  ),
                                )
                                .map((next) => (
                                  <ActionButton
                                    key={next.to}
                                    action={transitionWorkstream.bind(
                                      null,
                                      id,
                                      workstream.id,
                                      next.to,
                                      workstream.version,
                                    )}
                                    label={next.label}
                                  />
                                ))
                            : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHead title="Team">
              <span className="muted" style={{ fontSize: 13 }}>
                Membership is what grants access to this project
              </span>
            </CardHead>
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role here</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId}>
                    <td>
                      <Value>{userName.get(member.userId) ?? member.userId}</Value>
                    </td>
                    <td>
                      <Value>{roleName.get(member.roleCode) ?? member.roleCode}</Value>
                    </td>
                    <td className="nowrap">
                      <DateText value={member.grantedAt} />
                    </td>
                    <td className="right">
                      {mayManageMembers && members.length > 1 ? (
                        <ActionButton
                          action={removeMember.bind(null, id, member.userId)}
                          label="Remove"
                          variant="danger"
                          confirm="Remove them from this project? They will lose access to it."
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {mayManageMembers && addable.length > 0 ? (
              <CardBody>
                <ActionForm action={addMember} submitLabel="Add to project">
                  <input type="hidden" name="projectId" value={id} />
                  <div className="form-grid">
                    <Select
                      label="Person"
                      name="userId"
                      required
                      options={addable.map((u) => ({
                        value: u.id,
                        label: `${u.displayName} (${u.email})`,
                      }))}
                    />
                    <Select
                      label="Role on this project"
                      name="roleCode"
                      required
                      hint="What they do here. Their permissions still come from their own role."
                      options={ROLE_DEFINITIONS.map((r) => ({ value: r.code, label: r.name }))}
                    />
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
              <dt>Code</dt>
              <dd className="mono">{project.code}</dd>
              <dt>Client</dt>
              <dd>
                {client ? (
                  <Link href={`/clients/${client.id}`}>{client.name}</Link>
                ) : (
                  <span className="faint">Not shown</span>
                )}
              </dd>
              <dt>Property</dt>
              <dd>
                {property ? (
                  <Link href={`/properties/${property.id}`}>{property.name}</Link>
                ) : (
                  <span className="faint">Not shown</span>
                )}
              </dd>
              <dt>Type</dt>
              <dd>
                {project.type === 'BOTH' ? 'Planning and supervision' : project.type.toLowerCase()}
              </dd>
              <dt>Start</dt>
              <dd>
                <DateText value={project.startDate} />
              </dd>
              <dt>Target end</dt>
              <dd>
                <DateText value={project.targetEndDate} />
              </dd>
              {project.actualEndDate ? (
                <>
                  <dt>Completed</dt>
                  <dd>
                    <DateText value={project.actualEndDate} />
                  </dd>
                </>
              ) : null}
              {project.description ? (
                <>
                  <dt>Description</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{project.description}</dd>
                </>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
