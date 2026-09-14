import type { NotificationItem } from '@ecms/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ActionButton } from '@/components/form';
import { Nav } from '@/components/nav';
import { api } from '@/lib/api';
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
    { href: '/dashboard', label: 'Dashboard', show: true },
    { href: '/projects', label: 'Projects', show: true },
    { href: '/proposals', label: 'Proposals', show: session.can('proposal:view') },
    { href: '/clients', label: 'Clients', show: session.can('client:view') },
    { href: '/properties', label: 'Properties', show: session.can('property:view') },
    { href: '/sketch-types', label: 'Sketch types', show: session.can('sketch_type:admin') },
    {
      href: '/required-documents',
      label: 'Required documents',
      show: session.can('required_document:admin'),
    },
    { href: '/users', label: 'Users', show: session.can('user:view') },
  ]
    .filter((link) => link.show)
    .map(({ href, label }) => ({ href, label }));

  // Recomputed on every navigation, never pushed — the same posture the
  // notifications page itself takes (docs/phase-11-plan.md §5).
  const notificationCount = await api
    .get<NotificationItem[]>('/notifications')
    .then((items) => items.length)
    .catch(() => 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          ECMS
          <span>Consultancy management</span>
        </div>

        <form action="/search" className="row" style={{ margin: '0 var(--space-3) var(--space-3)' }}>
          <input
            type="search"
            name="q"
            placeholder="Search..."
            aria-label="Search"
            style={{ width: '100%' }}
          />
        </form>

        <Nav links={links} />

        <div className="sidebar__footer">
          <Link href="/notifications">
            Notifications{notificationCount > 0 ? ` (${notificationCount})` : ''}
          </Link>
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
