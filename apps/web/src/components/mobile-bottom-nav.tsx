'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DashboardIcon, ProjectsIcon, ProposalsIcon } from './icons';
import type { SidebarGroup } from './sidebar';

const TABS = [
  { href: '/dashboard', label: 'Home', Icon: DashboardIcon },
  { href: '/projects', label: 'Projects', Icon: ProjectsIcon },
  { href: '/proposals', label: 'Proposals', Icon: ProposalsIcon },
] as const;

/**
 * Mobile-only tab bar (CSS hides it above 700px). Tabs are limited to what the
 * person's permission-filtered sidebar already offers, so it never links
 * anywhere the rail would not. "Menu" opens the existing off-canvas drawer.
 */
export function MobileBottomNav({
  groups,
  notificationCount,
  onOpenMenu,
}: {
  groups: SidebarGroup[];
  notificationCount: number;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const allowed = new Set(groups.flatMap((g) => g.links.map((l) => l.href)));

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.filter((t) => allowed.has(t.href)).map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="bottom-nav__tab"
            aria-current={active ? 'page' : undefined}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
      <button type="button" className="bottom-nav__tab" onClick={onOpenMenu}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Menu
        {notificationCount > 0 ? (
          <span className="bottom-nav__badge">
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        ) : null}
      </button>
    </nav>
  );
}
