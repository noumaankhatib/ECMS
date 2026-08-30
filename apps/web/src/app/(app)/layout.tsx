import type { ReactNode } from 'react';

import { ActionButton } from '@/components/form';
import { Nav } from '@/components/nav';
import { requireSession } from '@/lib/session';

import { signOut } from '../login/actions';

/**
 * The signed-in shell.
 *
 * Every page underneath is behind this, so there is no route in the application
 * that renders without a session having been resolved first. A page cannot
 * forget to check, because it is not the page that checks.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  // Only what this person can actually use. Each of these is enforced again by
  // the API; this only decides what is worth showing them.
  const links = [
    { href: '/projects', label: 'Projects', show: true },
    { href: '/clients', label: 'Clients', show: session.can('client:view') },
    { href: '/properties', label: 'Properties', show: session.can('property:view') },
    { href: '/users', label: 'Users', show: session.can('user:view') },
  ]
    .filter((link) => link.show)
    .map(({ href, label }) => ({ href, label }));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          ECMS
          <span>Consultancy management</span>
        </div>

        <Nav links={links} />

        <div className="sidebar__footer">
          <strong>{session.user.displayName}</strong>
          {session.user.email}
          <div style={{ marginTop: 'var(--space-3)' }}>
            <ActionButton action={signOut} label="Sign out" />
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
