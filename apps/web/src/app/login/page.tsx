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
        <BlueprintMotif />
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

/** Faint elevation linework — decorative only, drawn in once on load. */
function BlueprintMotif() {
  return (
    <svg
      className="login__motif"
      viewBox="0 0 600 420"
      preserveAspectRatio="xMidYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
    >
      <path pathLength={1} d="M-1200 360H1800" />
      <path pathLength={1} d="M70 360V190H210V360" />
      <path pathLength={1} d="M70 190L140 130L210 190" />
      <path pathLength={1} d="M250 360V90H400V360" />
      <path pathLength={1} d="M250 90H400" />
      <path pathLength={1} d="M280 130H370M280 170H370M280 210H370M280 250H370M280 290H370" />
      <path pathLength={1} d="M440 360V230H540V360" />
      <path pathLength={1} d="M440 230H540" />
      <path pathLength={1} d="M105 360V290H135V360M165 245H190V270H165Z" />
      <path pathLength={1} d="M70 392H210M70 386V398M210 386V398" />
      <path pathLength={1} d="M250 392H400M250 386V398M400 386V398" />
      <circle pathLength={1} cx="500" cy="110" r="38" />
      <path pathLength={1} d="M500 62V158M452 110H548" />
    </svg>
  );
}
