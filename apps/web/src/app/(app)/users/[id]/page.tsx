import { ROLE_DEFINITIONS, type Role, type RoleDetail } from '@ecms/contracts';

import { ActionButton, ActionForm, Field } from '@/components/form';
import { RoleChooser, RolePermissions } from '@/components/role-guide';
import { Badge, Breadcrumb, Card, CardBody, CardHead, DateText, DetailGroup, DetailItem, PageHead } from '@/components/ui';
import { UserWorkSections } from '@/components/user-work';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';
import type { UserRow } from '@/lib/types';

import { assignRole, removeRole, setPassword, setStatus, updateUser } from '../actions';

export const metadata = { title: 'User — ECMS' };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('user:view');
  const { id } = await params;

  const user = await api.get<UserRow>(`/users/${id}`);
  // What each role allows, from the same rows the system enforces. If it cannot
  // be loaded (or this person may not see roles) the page still works; it just
  // cannot explain the roles.
  const roleDetails: RoleDetail[] = session.can('role:view')
    ? await api
        .get<{ roles: RoleDetail[] }>('/roles')
        .then((r) => r.roles)
        .catch(() => [])
    : [];
  const roleName = new Map(ROLE_DEFINITIONS.map((r) => [r.code as string, r.name]));

  const mayAdminUser = session.can('user:admin');
  const mayAdminRoles = session.can('role:admin');
  const isSelf = session.user.id === user.id;

  const held = new Set<string>(user.roles);
  const available = ROLE_DEFINITIONS.filter((role) => !held.has(role.code));

  return (
    <>
      <Breadcrumb items={[{ href: '/users', label: 'Users' }, { label: user.displayName }]} />
      <PageHead title={user.displayName} description={user.username}>
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

      <UserWorkSections userId={id} session={session} />

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Roles">
              <span className="muted u-text-sm" >
                What kind of work they do
              </span>
            </CardHead>
            <CardBody>
              <div className="row u-mb-3" >
                {user.roles.length === 0 ? (
                  <span className="muted">
                    No role. They can sign in but will not be able to do anything.
                  </span>
                ) : (
                  user.roles.map((role) => (
                    <span key={role} className="row u-gap-1" >
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
                  <RoleChooser
                    key={available.map((r) => r.code).join()}
                    label="Add a role"
                    roles={
                      roleDetails.length > 0
                        ? roleDetails.filter((r) => !held.has(r.code))
                        : available.map((r) => ({ ...r, permissions: [] }))
                    }
                  />
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          {roleDetails.length > 0 ? (
            <Card>
              <CardHead title="What they can do">
                <span className="muted u-text-sm">From their role{user.roles.length > 1 ? 's' : ''}</span>
              </CardHead>
              <CardBody>
                <RolePermissions
                  roles={roleDetails.filter((r) => held.has(r.code))}
                  emptyText="They have no role, so they can sign in but cannot do anything yet."
                />
              </CardBody>
            </Card>
          ) : null}

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
            <DetailGroup>
              <DetailItem label="Username">{user.username}</DetailItem>
              <DetailItem label="Email">{user.email ?? <span className="faint">—</span>}</DetailItem>
              <DetailItem label="Status">{user.status === 'ACTIVE' ? 'Active' : 'Disabled'}</DetailItem>
              <DetailItem label="Added"><DateText value={user.createdAt} /></DetailItem>
            </DetailGroup>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
