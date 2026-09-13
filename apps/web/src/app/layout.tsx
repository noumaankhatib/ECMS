import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'ECMS',
  description: 'Engineering Consultancy Management System',
};

/**
 * The IBM Plex superfamily, not a generic system stack.
 *
 * Chosen for what it is, not arbitrarily: Plex was drawn for technical and
 * engineering documentation, so a serif for report/title-block headings, a
 * grotesk for operational UI, and a monospace for reference codes come from
 * one coherent design rather than three unrelated picks. PRD §18's colour
 * palette and §19 direction ("professional, premium, clean and
 * architectural... avoid neon colours, excessive gradients, glassmorphism and
 * heavy shadows") are unchanged — this only supplies the typographic voice
 * they were missing.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-plex-serif',
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
    <html
      lang="en-GB"
      className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
