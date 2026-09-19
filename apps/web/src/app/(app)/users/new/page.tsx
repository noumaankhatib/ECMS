import { ROLE_DEFINITIONS } from '@ecms/contracts';

import { ActionForm, Field, Select } from '@/components/form';
import { Breadcrumb, Card, CardBody, PageHead } from '@/components/ui';
import { requirePermission } from '@/lib/session';

import { createUser } from '../actions';

export const metadata = { title: 'New user — ECMS' };

export default async function NewUserPage() {
  await requirePermission('user:admin');

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
              <Select
                label="Role"
                name="roleCode"
                required
                hint="What kind of work they do. Where they may do it comes from project membership."
                options={ROLE_DEFINITIONS.map((r) => ({ value: r.code, label: r.name }))}
              />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
