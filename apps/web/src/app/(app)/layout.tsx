import type { NotificationItem } from '@ecms/contracts';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import type { QuickCreateLink } from '@/components/header';
import type { SidebarLink } from '@/components/sidebar';
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
  const links: SidebarLink[] = (
    [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', show: true },
      { href: '/projects', label: 'Projects', icon: 'projects', show: true },
      {
        href: '/planning',
        label: 'Planning',
        icon: 'planning',
        show: session.can('planning:view'),
      },
      {
        href: '/supervision',
        label: 'Supervision',
        icon: 'supervision',
        show: session.can('supervision:view'),
      },
      {
        href: '/proposals',
        label: 'Proposals',
        icon: 'proposals',
        show: session.can('proposal:view'),
      },
      { href: '/clients', label: 'Clients', icon: 'clients', show: session.can('client:view') },
      {
        href: '/properties',
        label: 'Properties',
        icon: 'properties',
        show: session.can('property:view'),
      },
      {
        href: '/sketch-types',
        label: 'Sketch types',
        icon: 'sketchTypes',
        show: session.can('sketch_type:admin'),
      },
      {
        href: '/required-documents',
        label: 'Required documents',
        icon: 'documents',
        show: session.can('required_document:admin'),
      },
      { href: '/users', label: 'Users', icon: 'users', show: session.can('user:view') },
      {
        href: '/admin/data',
        label: 'Data management',
        icon: 'adminData',
        show: session.can('admin:data'),
      },
      {
        href: '/approvals',
        label: 'Approvals',
        icon: 'approvals',
        show:
          session.can('drawing:approve') ||
          session.can('planning:approve') ||
          session.can('proposal:edit'),
      },
      { href: '/reports', label: 'Reports', icon: 'reports', show: true },
      { href: '/settings', label: 'Settings', icon: 'settings', show: true },
      { href: '/help', label: 'Help & Support', icon: 'help', show: true },
    ] as const
  )
    .filter((link) => link.show)
    .map(({ href, label, icon }) => ({ href, label, icon }));

  // Recomputed on every navigation, never pushed — the same posture the
  // notifications page itself takes (docs/phase-11-plan.md §5).
  const notificationCount = await api
    .get<NotificationItem[]>('/notifications')
    .then((items) => items.length)
    .catch(() => 0);

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get('ecms_sidebar_collapsed')?.value === '1';

  // The same permission-gated set the dashboard's own "Quick actions" card
  // offers (docs/phase-11-plan.md §8) — mirrored here so it is reachable
  // from every page, not only the dashboard. The dashboard's card is
  // untouched; this is a second entry point to the same four links.
  const quickCreateLinks: QuickCreateLink[] = (
    [
      { href: '/projects/new', label: 'New project', icon: 'projects', show: session.can('project:create') },
      { href: '/proposals/new', label: 'New proposal', icon: 'proposals', show: session.can('proposal:create') },
      { href: '/clients/new', label: 'New client', icon: 'clients', show: session.can('client:create') },
      { href: '/projects', label: 'Upload document', icon: 'documents', show: session.can('document:create') },
    ] as const
  )
    .filter((link) => link.show)
    .map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AppShell
      links={links}
      defaultCollapsed={defaultCollapsed}
      quickCreateLinks={quickCreateLinks}
      brand={
        <>
          <span className="sidebar__brand-mark">EC</span>
          <span className="sidebar__brand-full">
            ECMS
            <span>Consultancy management</span>
          </span>
        </>
      }
      footer={
        <>
          <span className="avatar avatar--sidebar">
            {session.user.displayName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('')}
          </span>
          <div className="sidebar__footer-detail">
            <strong>{session.user.displayName}</strong>
            <span>{session.user.username}</span>
          </div>
        </>
      }
      displayName={session.user.displayName}
      identifier={session.user.username}
      notificationCount={notificationCount}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
