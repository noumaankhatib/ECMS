'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';

import { CommandPalette } from './command-palette';
import {
  BellIcon,
  ChevronDownIcon,
  ClientsIcon,
  DocumentsIcon,
  PlusIcon,
  ProjectsIcon,
  ProposalsIcon,
  SearchIcon,
} from './icons';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export type QuickCreateIconKey = 'projects' | 'proposals' | 'clients' | 'documents';

/** See `SidebarLink`/`ICONS` in `sidebar.tsx` — same reason a link names its
 *  icon by key rather than passing a component: only serializable data
 *  crosses from the server-rendered layout into this client component. */
const QUICK_CREATE_ICONS: Record<QuickCreateIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  projects: ProjectsIcon,
  proposals: ProposalsIcon,
  clients: ClientsIcon,
  documents: DocumentsIcon,
};

export interface QuickCreateLink {
  href: string;
  label: string;
  icon: QuickCreateIconKey;
}

/**
 * The global header — search, notifications, account. Kept deliberately
 * light: it never competes with page content (no page title lives here; each
 * page still owns its own `PageHead`), and every control it offers already
 * exists elsewhere in the application (search, `/notifications`, sign out) —
 * this is a second entry point to each, not a new feature.
 */
export function Header({
  displayName,
  identifier,
  notificationCount,
  signOutAction,
  onOpenMobileMenu,
  quickCreateLinks,
}: {
  displayName: string;
  identifier: string;
  notificationCount: number;
  signOutAction: () => Promise<void>;
  onOpenMobileMenu: () => void;
  quickCreateLinks: QuickCreateLink[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !createOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (createOpen && createRef.current && !createRef.current.contains(event.target as Node)) {
        setCreateOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setCreateOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen, createOpen]);

  // The command palette's global keyboard shortcut — ⌘K on a Mac, Ctrl+K
  // everywhere else — lives here because the header is mounted once, on
  // every signed-in page, exactly where the visible search field already is.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="header">
      <button
        type="button"
        className="header__menu-toggle"
        aria-label="Open menu"
        onClick={onOpenMobileMenu}
      >
        <span />
        <span />
        <span />
      </button>

      <form
        action="/search"
        className="header__search"
        role="search"
        onSubmit={(event) => {
          // JS is available (this handler ran at all) — hand off to the
          // richer palette instead of a full page navigation. The `action`
          // above is the no-JS fallback and still works if it never runs.
          event.preventDefault();
          setPaletteOpen(true);
        }}
      >
        <SearchIcon className="header__search-icon" />
        <input
          type="search"
          name="q"
          placeholder="Search projects, clients, proposals..."
          aria-label="Search"
          onFocus={(event) => {
            event.currentTarget.blur();
            setPaletteOpen(true);
          }}
        />
        <kbd className="header__search-kbd">Ctrl K</kbd>
      </form>

      <div className="header__actions">
        {quickCreateLinks.length > 0 ? (
          <div className="header__menu" ref={createRef}>
            <button
              type="button"
              className="button button--small header__quick-create"
              onClick={() => setCreateOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={createOpen}
            >
              <PlusIcon width={16} height={16} />
              Quick create
              <ChevronDownIcon />
            </button>

            {createOpen ? (
              <div className="header__menu-panel header__menu-panel--wide" role="menu">
                {quickCreateLinks.map((link) => {
                  const Icon = QUICK_CREATE_ICONS[link.icon];
                  return (
                    <Link
                      key={link.href + link.label}
                      href={link.href}
                      role="menuitem"
                      className="header__quick-create-item"
                      onClick={() => setCreateOpen(false)}
                    >
                      <Icon width={16} height={16} />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <Link href="/notifications" className="header__icon-button" aria-label="Notifications">
          <BellIcon />
          {notificationCount > 0 ? (
            <span className="header__badge">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          ) : null}
        </Link>

        <div className="header__menu" ref={menuRef}>
          <button
            type="button"
            className="header__account"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="avatar">{initialsOf(displayName)}</span>
            <span className="header__account-name">{displayName}</span>
            <ChevronDownIcon />
          </button>

          {menuOpen ? (
            <MenuPanel
              identifier={identifier}
              signOutAction={signOutAction}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}

function MenuPanel({
  identifier,
  signOutAction,
  onClose,
}: {
  identifier: string;
  signOutAction: () => Promise<void>;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="header__menu-panel" role="menu">
      <div className="header__menu-identifier">{identifier}</div>
      <Link href="/settings" role="menuitem" onClick={onClose}>
        Settings
      </Link>
      <Link href="/help" role="menuitem" onClick={onClose}>
        Help &amp; Support
      </Link>
      <form action={signOutAction}>
        <button type="submit" role="menuitem" className="header__menu-signout">
          Sign out
        </button>
      </form>
    </div>
  );
}
