'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The navigation.
 *
 * It is given only the links this person may use — the decision was made on the
 * server, from their grants. Hiding a link is a courtesy: the API refuses the
 * route independently, and typing the address by hand gets you nowhere.
 */
export function Nav({ links }: { links: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Main">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} {...(active ? { 'aria-current': 'page' } : {})}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
