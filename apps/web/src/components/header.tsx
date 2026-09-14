'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BellIcon, ChevronDownIcon, SearchIcon } from './icons';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
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
  email,
  notificationCount,
  signOutAction,
  onOpenMobileMenu,
}: {
  displayName: string;
  email: string;
  notificationCount: number;
  signOutAction: () => Promise<void>;
  onOpenMobileMenu: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

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

      <form action="/search" className="header__search" role="search">
        <SearchIcon className="header__search-icon" />
        <input
          type="search"
          name="q"
          placeholder="Search projects, clients, proposals..."
          aria-label="Search"
        />
      </form>

      <div className="header__actions">
        <Link href="/notifications" className="header__icon-button" aria-label="Notifications">
          <BellIcon />
          {notificationCount > 0 ? (
            <span className="header__badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
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
            <MenuPanel email={email} signOutAction={signOutAction} onClose={() => setMenuOpen(false)} />
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MenuPanel({
  email,
  signOutAction,
  onClose,
}: {
  email: string;
  signOutAction: () => Promise<void>;
  onClose: () => void;
}): ReactNode {
  return (
    <div className="header__menu-panel" role="menu">
      <div className="header__menu-email">{email}</div>
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
