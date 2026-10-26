import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';

import { ClientsIcon, ProjectsIcon, ProposalsIcon, ReportsIcon } from '@/components/icons';
import { currentSession } from '@/lib/session';

import { LoginForm } from './login-form';
import background from './login-bg.webp';

export const metadata = { title: 'Sign in — ECMS' };

export default async function LoginPage() {
  // Already signed in? Nobody wants to be shown a login form they do not need.
  if (await currentSession()) redirect('/projects');

  return (
    <main className="login">
      <section
        className="login__aside"
        aria-label="About ECMS"
        style={{ '--login-photo': `url(${background.src})` } as CSSProperties}
      >
        <div className="login__aside-content">
          <div className="login__logo">
            <BrandMark />
            <span>ECMS</span>
          </div>
          <span className="login__rule" aria-hidden="true" />
          <h1 className="login__aside-title">
            <span className="login__line">Engineering Consultancy</span>{' '}
            <span className="login__line">Management System</span>
          </h1>
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
