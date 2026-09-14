import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'ECMS',
  description: 'Engineering Consultancy Management System',
};

/**
 * IBM Plex Sans and Mono — a clean, modern grotesk plus the monospace still
 * used for reference codes (docs/globals.css's own note on this). The
 * superfamily's serif cut was dropped in the 2026-09 visual refresh: it read
 * as a "heavy" display face against the rest of that redesign, and a serif
 * headline was never the point of choosing Plex in the first place — one
 * coherent, technical-documentation-drawn family was. System-font fallbacks
 * keep the page usable before/without the webfont.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
