'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { Header, type QuickCreateLink } from './header';
import { Sidebar, type SidebarLink } from './sidebar';

/**
 * Owns the one piece of state `Sidebar` and `Header` both need to share but
 * cannot pass to each other directly (they are siblings under the
 * server-rendered layout): whether the mobile drawer is open. Desktop
 * collapse state stays local to `Sidebar` — nothing outside it needs to know.
 */
export function AppShell({
  links,
  defaultCollapsed,
  brand,
  footer,
  displayName,
  identifier,
  notificationCount,
  signOutAction,
  quickCreateLinks,
  children,
}: {
  links: SidebarLink[];
  defaultCollapsed: boolean;
  brand: ReactNode;
  footer: ReactNode;
  displayName: string;
  identifier: string;
  notificationCount: number;
  signOutAction: () => Promise<void>;
  quickCreateLinks: QuickCreateLink[];
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="shell">
      <Sidebar
        links={links}
        defaultCollapsed={defaultCollapsed}
        brand={brand}
        footer={footer}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="content-area">
        <Header
          displayName={displayName}
          identifier={identifier}
          notificationCount={notificationCount}
          signOutAction={signOutAction}
          onOpenMobileMenu={() => setMobileOpen(true)}
          quickCreateLinks={quickCreateLinks}
        />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
