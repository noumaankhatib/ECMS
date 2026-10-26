import { redirect } from 'next/navigation';

import { ClientsIcon, ProjectsIcon, ProposalsIcon, ReportsIcon } from '@/components/icons';
import { currentSession } from '@/lib/session';

import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — ECMS' };

export default async function LoginPage() {
  // Already signed in? Nobody wants to be shown a login form they do not need.
  if (await currentSession()) redirect('/projects');

  return (
    <main className="login">
      <section className="login__aside" aria-label="About ECMS">
        <div className="login__aside-grid" aria-hidden="true" />
        <BuildingScene />
        <div className="login__aside-content">
          <div className="login__logo">
            <BrandMark />
            <span>ECMS</span>
          </div>
          <span className="login__rule" aria-hidden="true" />
          <h1 className="login__aside-title">Engineering Consultancy Management System</h1>
          <p className="login__aside-lead">
            A comprehensive platform to manage proposals, projects, clients, planning, supervision,
            and approvals — all in one place.
          </p>
          <ul className="login__features">
            <li>
              <ProposalsIcon width={26} height={26} />
              Proposals
            </li>
            <li>
              <ProjectsIcon width={26} height={26} />
              Projects
            </li>
            <li>
              <ClientsIcon width={26} height={26} />
              Clients
            </li>
            <li>
              <ReportsIcon width={26} height={26} />
              Reports
            </li>
          </ul>
        </div>
      </section>

      <section className="login__panel">
        <div className="login__card">
          <div className="login__brand">
            <div className="login__logo login__logo--dark">
              <BrandMark />
              <span>ECMS</span>
            </div>
            <span>Engineering Consultancy Management System</span>
          </div>

          <div className="login__heading">
            <h2>Sign in to your account</h2>
            <p>Enter your credentials to continue to ECMS</p>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}

/** Three stepped towers — the ECMS mark. Decorative; the name sits beside it. */
function BrandMark() {
  return (
    <svg
      className="login__logo-mark"
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 36V16l8-4v24H4Z" fill="currentColor" opacity="0.55" />
      <path d="M14 36V6l9-3v33h-9Z" fill="currentColor" />
      <path d="M25 36V14l9 4v18h-9Z" fill="#3157d5" />
      <path d="M17 12h3M17 17h3M17 22h3M17 27h3" stroke="#172338" strokeWidth="1.6" />
    </svg>
  );
}

type Pt = readonly [number, number];

/** Bilinear point on a four-cornered face (u across, v down). */
function facePoint([tl, tr, bl, br]: readonly [Pt, Pt, Pt, Pt], u: number, v: number): string {
  const top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
  const bottom = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
  const x = top[0]! + (bottom[0]! - top[0]!) * v;
  const y = top[1]! + (bottom[1]! - top[1]!) * v;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

/** A grid of glass panes on one face of the tower; some are lit. */
function Panes({
  face,
  cols,
  rows,
  seed,
}: {
  face: readonly [Pt, Pt, Pt, Pt];
  cols: number;
  rows: number;
  seed: number;
}) {
  const panes = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const u0 = (c + 0.14) / cols;
      const u1 = (c + 0.86) / cols;
      const v0 = (r + 0.16) / rows;
      const v1 = (r + 0.84) / rows;
      const lit = (c * 7 + r * 3 + seed) % 6 === 0;
      panes.push(
        <polygon
          key={`${c}-${r}`}
          points={[
            facePoint(face, u0, v0),
            facePoint(face, u1, v0),
            facePoint(face, u1, v1),
            facePoint(face, u0, v1),
          ].join(' ')}
          fill={lit ? 'url(#login-lit)' : 'url(#login-glass)'}
        />,
      );
    }
  }
  return <>{panes}</>;
}

const FRONT = [
  [0, 250],
  [250, 150],
  [0, 440],
  [250, 440],
] as const satisfies readonly [Pt, Pt, Pt, Pt];
const SIDE = [
  [250, 150],
  [380, 96],
  [250, 440],
  [380, 440],
] as const satisfies readonly [Pt, Pt, Pt, Pt];

/**
 * A lit glass tower in perspective with a wireframe of the next one rising
 * behind it. Drawn, not photographed: decorative only, no content in it.
 */
function BuildingScene() {
  return (
    <svg
      className="login__scene"
      viewBox="0 0 640 440"
      preserveAspectRatio="xMinYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="login-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a4b86" />
          <stop offset="1" stopColor="#12223f" />
        </linearGradient>
        <linearGradient id="login-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2f57" />
          <stop offset="1" stopColor="#0d1a33" />
        </linearGradient>
        <linearGradient id="login-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fa5ee" stopOpacity="0.5" />
          <stop offset="1" stopColor="#3157d5" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="login-lit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#f0a24b" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="login-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#172338" stopOpacity="0" />
          <stop offset="1" stopColor="#172338" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      <g className="login__scene-wire" fill="none" stroke="#8fb1ff" strokeWidth="1">
        <path d="M420 440V120L520 70L620 120V440" />
        <path d="M520 70V440M420 120L620 120M420 180H620M420 240H620M420 300H620M420 360H620" />
        <path d="M420 120L620 240M620 120L420 240M420 240L620 360M620 240L420 360" />
        <path d="M470 440V95M570 440V95" strokeDasharray="4 6" />
      </g>

      <polygon points="250,150 380,96 380,440 250,440" fill="url(#login-side)" />
      <polygon points="0,250 250,150 250,440 0,440" fill="url(#login-front)" />
      <Panes face={FRONT} cols={6} rows={9} seed={1} />
      <Panes face={SIDE} cols={3} rows={9} seed={4} />
      <path
        d="M0 250L250 150L380 96"
        fill="none"
        stroke="#c7d8ff"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <path d="M250 150V440" stroke="#c7d8ff" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="0" y="330" width="640" height="110" fill="url(#login-fade)" />
    </svg>
  );
}
