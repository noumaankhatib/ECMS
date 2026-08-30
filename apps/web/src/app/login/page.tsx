import { redirect } from 'next/navigation';

import { ActionForm, Field } from '@/components/form';
import { Card, CardBody } from '@/components/ui';
import { currentSession } from '@/lib/session';

import { signIn } from './actions';

export const metadata = { title: 'Sign in — ECMS' };

export default async function LoginPage() {
  // Already signed in? Nobody wants to be shown a login form they do not need.
  if (await currentSession()) redirect('/projects');

  return (
    <main className="login">
      <div className="login__card">
        <div className="login__brand">
          <strong>ECMS</strong>
          <span>Engineering Consultancy Management System</span>
        </div>

        <Card>
          <CardBody>
            <ActionForm action={signIn} submitLabel="Sign in">
              <Field
                label="Email address"
                name="email"
                type="email"
                required
                autoComplete="username"
              />
              <Field
                label="Password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
