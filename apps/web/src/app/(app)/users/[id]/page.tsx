import { ROLE_DEFINITIONS, type Role } from '@ecms/contracts';

import { ActionButton, ActionForm, Field, Select } from '@/components/form';
import { Badge, Breadcrumb, Card, CardBody, CardHead, DateText, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { UserRow } from '@/lib/types';

import { assignRole, removeRole, setPassword, setStatus, updateUser } from '../actions';

export const metadata = { title: 'User — ECMS' };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('user:view');
  const { id } = await params;

  const user = await api.get<UserRow>(`/users/${id}`);
  const roleName = new Map(ROLE_DEFINITIONS.map((r) => [r.code as string, r.name]));

  const mayAdminUser = session.can('user:admin');
  const mayAdminRoles = session.can('role:admin');
  const isSelf = session.user.id === user.id;

  const held = new Set<string>(user.roles);
  const available = ROLE_DEFINITIONS.filter((role) => !held.has(role.code));

  return (
    <>
      <Breadcrumb items={[{ href: '/users', label: 'Users' }, { label: user.displayName }]} />
      <PageHead title={user.displayName} description={user.email}>
        {user.status === 'DISABLED' ? <span className="badge">Disabled</span> : null}
        {mayAdminUser && !isSelf ? (
          user.status === 'ACTIVE' ? (
            <ActionButton
              action={setStatus.bind(null, id, 'DISABLED')}
              label="Disable account"
              variant="danger"
              confirm={`Disable ${user.displayName}? They will be signed out immediately and cannot sign in again until this is undone. Their history is kept.`}
            />
          ) : (
            <ActionButton action={setStatus.bind(null, id, 'ACTIVE')} label="Enable account" />
          )
        ) : null}
      </PageHead>

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Roles">
              <span className="muted" style={{ fontSize: 13 }}>
                What kind of work they do
              </span>
            </CardHead>
            <CardBody>
              <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                {user.roles.length === 0 ? (
                  <span className="muted">
                    No role. They can sign in but will not be able to do anything.
                  </span>
                ) : (
                  user.roles.map((role) => (
                    <span key={role} className="row" style={{ gap: 'var(--space-1)' }}>
                      <Badge>{roleName.get(role) ?? role}</Badge>
                      {mayAdminRoles ? (
                        <ActionButton
                          action={removeRole.bind(null, id, role as Role)}
                          label="Remove"
                          variant="danger"
                          confirm={`Remove ${roleName.get(role) ?? role} from ${user.displayName}?`}
                        />
                      ) : null}
                    </span>
                  ))
                )}
              </div>

              {mayAdminRoles && available.length > 0 ? (
                <ActionForm action={assignRole} submitLabel="Grant role">
                  <input type="hidden" name="id" value={id} />
                  <Select
                    label="Add a role"
                    name="roleCode"
                    required
                    options={available.map((r) => ({ value: r.code, label: r.name }))}
                  />
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          {mayAdminUser ? (
            <>
              <Card>
                <CardHead title="Details" />
                <CardBody>
                  <ActionForm action={updateUser} submitLabel="Save changes">
                    <input type="hidden" name="id" value={id} />
                    <Field
                      label="Full name"
                      name="displayName"
                      defaultValue={user.displayName}
                      required
                    />
                    {/* The email address is not editable. It identifies the
                        account and appears throughout the audit trail; changing
                        it would quietly rewrite who did what. */}
                  </ActionForm>
                </CardBody>
              </Card>

              <Card>
                <CardHead title="Set a new password" />
                <CardBody>
                  <ActionForm action={setPassword} submitLabel="Set password">
                    <input type="hidden" name="id" value={id} />
                    <Field
                      label="New password"
                      name="password"
                      type="password"
                      required
                      autoComplete="new-password"
                      hint="At least 12 characters. Every session they currently hold will end."
                    />
                  </ActionForm>
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>

        <Card>
          <CardHead title="Account" />
          <CardBody>
            <dl className="definition">
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Status</dt>
              <dd>{user.status === 'ACTIVE' ? 'Active' : 'Disabled'}</dd>
              <dt>Added</dt>
              <dd>
                <DateText value={user.createdAt} />
              </dd>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
