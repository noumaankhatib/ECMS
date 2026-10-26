'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { ErrorBanner } from '@/components/form';
import type { FormState } from '@/lib/form-state';

import { signIn } from './actions';

/**
 * The sign-in form.
 *
 * It submits to the same `signIn` server action as before, so validation,
 * session handling and redirects are untouched; this component only changes
 * how the form looks and what it shows while a request is pending. The
 * username is kept in state because React clears uncontrolled fields after an
 * action finishes — a typo in the password should not cost the person their
 * username. The password is deliberately never kept.
 */
export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signIn, {});
  const [identifier, setIdentifier] = useState('');
  const [reveal, setReveal] = useState(false);
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="login-form">
      <ErrorBanner state={state} />

      <div className="login-field">
        <label htmlFor="identifier">
          Username or email<span aria-hidden="true"> *</span>
        </label>
        <div className="login-field__control">
          <span className="login-field__icon" aria-hidden="true">
            <UserIcon />
          </span>
          <input
            id="identifier"
            name="identifier"
            type="text"
            placeholder="Enter username or email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            aria-invalid={invalid || undefined}
          />
        </div>
      </div>

      <div className="login-field">
        <label htmlFor="password">
          Password<span aria-hidden="true"> *</span>
        </label>
        <div className="login-field__control">
          <span className="login-field__icon" aria-hidden="true">
            <LockIcon />
          </span>
          <input
            id="password"
            placeholder="Enter password"
            name="password"
            type={reveal ? 'text' : 'password'}
            required
            autoComplete="current-password"
            aria-invalid={invalid || undefined}
          />
          <button
            type="button"
            className="login-field__toggle"
            onClick={() => setReveal((value) => !value)}
            aria-pressed={reveal}
            aria-label={reveal ? 'Hide characters' : 'Show characters'}
          >
            {reveal ? <EyeOffIcon key="hide" /> : <EyeIcon key="show" />}
          </button>
        </div>
      </div>

      <SignInButton />
    </form>
  );
}

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="login-submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="login-spinner" aria-hidden="true" />
          Signing in…
        </>
      ) : (
        <>
          Sign in
          <ArrowIcon />
        </>
      )}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10.5 10.5 0 0 0 5.4-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function UserIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...svgProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg {...svgProps}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
