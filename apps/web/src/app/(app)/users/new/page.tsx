import { ROLE_DEFINITIONS, type RoleDetail } from '@ecms/contracts';

import { ActionForm, Field } from '@/components/form';
import { RoleChooser } from '@/components/role-guide';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { requirePermission } from '@/lib/session';

import { createUser } from '../actions';

export const metadata = { title: 'New user — ECMS' };

export default async function NewUserPage() {
  const session = await requirePermission('user:admin');

  // The permissions behind each role. Without role:view the picker still works
  // from the names alone; it just cannot explain them.
  const roles: RoleDetail[] = session.can('role:view')
    ? await api
        .get<{ roles: RoleDetail[] }>('/roles')
        .then((r) => r.roles)
        .catch(() => fallbackRoles())
    : fallbackRoles();

  return (
    <>
      <Breadcrumb items={[{ href: '/users', label: 'Users' }, { label: 'New' }]} />
      <PageHead
        title="New user"
        description="They can sign in as soon as this is saved. Tell them the password by a route other than email."
      />

      <Card>
        <CardBody>
          <ActionForm action={createUser} submitLabel="Create user" cancelHref="/users">
            <div className="form-grid">
              <Field
                label="Username"
                name="username"
                required
                hint="What they sign in with. Lowercase letters, numbers, dots, underscores or hyphens."
              />
              <Field label="Full name" name="displayName" required />
              <Field
                label="Email address"
                name="email"
                type="email"
                hint="Optional — this system sends no mail, so it's only an alternate way to sign in."
              />
              <Field
                label="Password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                hint="At least 12 characters. Length is what matters — a passphrase beats a short and cryptic one."
              />
            </div>
            <RoleChooser roles={roles} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}

function fallbackRoles(): RoleDetail[] {
  return ROLE_DEFINITIONS.map((role) => ({ ...role, permissions: [] }));
}
