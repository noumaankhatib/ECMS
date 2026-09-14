'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import {
  ChevronLeftIcon,
  ClientsIcon,
  DashboardIcon,
  DocumentsIcon,
  HelpIcon,
  ProjectsIcon,
  PropertiesIcon,
  ProposalsIcon,
  SettingsIcon,
  SketchTypesIcon,
  UsersIcon,
} from './icons';

const COOKIE_NAME = 'ecms_sidebar_collapsed';

/** A component reference cannot cross the server→client boundary (only
 *  serializable data can), so a link names its icon by key — this map,
 *  which lives entirely on the client side of that boundary, resolves it. */
const ICONS = {
  dashboard: DashboardIcon,
  projects: ProjectsIcon,
  proposals: ProposalsIcon,
  clients: ClientsIcon,
  properties: PropertiesIcon,
  sketchTypes: SketchTypesIcon,
  documents: DocumentsIcon,
  users: UsersIcon,
  settings: SettingsIcon,
  help: HelpIcon,
} as const;

export type SidebarIconKey = keyof typeof ICONS;

export interface SidebarLink {
  href: string;
  label: string;
  icon: SidebarIconKey;
}

/**
 * The primary navigation rail — expanded (labels visible) or collapsed
 * (icons only, tooltipped). The preference is a plain, non-sensitive cookie
 * set client-side on toggle, and read back server-side on the next request
 * (`AppLayout`) so a reload does not flash the wrong width.
 *
 * Active-state and permission-based visibility are unaffected by collapse —
 * both were decided before this component ever sees the link list.
 */
export function Sidebar({
  links,
  defaultCollapsed,
  brand,
  footer,
  mobileOpen,
  onCloseMobile,
}: {
  links: SidebarLink[];
  defaultCollapsed: boolean;
  brand: ReactNode;
  footer: ReactNode;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE_NAME}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${
          mobileOpen ? 'sidebar--mobile-open' : ''
        }`}
      >
        <div className="sidebar__top">
          <div className="sidebar__brand">{brand}</div>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <ChevronLeftIcon className={collapsed ? 'sidebar__toggle-icon--flipped' : ''} />
          </button>
        </div>

        <nav className="nav" aria-label="Main">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const Icon = ICONS[link.icon];
            return (
              <Link
                key={link.href}
                href={link.href}
                className="nav__item"
                data-tooltip={link.label}
                onClick={onCloseMobile}
                {...(active ? { 'aria-current': 'page' } : {})}
              >
                <Icon className="nav__icon" />
                <span className="nav__label">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__footer">{footer}</div>
      </aside>
    </>
  );
}
