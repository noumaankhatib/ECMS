'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import type { FormState } from '@/lib/form-state';

/**
 * Forms.
 *
 * All of them submit to a server action, so they work before JavaScript has
 * loaded and continue to work if it never does. The client component here adds
 * the pending state and the error display on top of a form that was already
 * functional.
 */

export function Field({
  label,
  name,
  id,
  type = 'text',
  defaultValue,
  required,
  hint,
  wide,
  autoComplete,
}: {
  label: string;
  name: string;
  /** Overrides the element's `id` (and its label/hint association) without
   *  changing `name` — needed wherever the same field repeats once per row
   *  (a table of per-row edit forms plus an "Add" form below it), since
   *  `id` must be unique across the whole page even though `name` is scoped
   *  to each row's own `<form>`. Defaults to `name`. */
  id?: string;
  type?: string;
  defaultValue?: string | null | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  autoComplete?: string;
}) {
  const fieldId = id ?? name;
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required ?? false}
        {...(hint ? { 'aria-describedby': `${fieldId}-hint` } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {hint ? (
        <span className="hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A real file input. There is exactly one form in this application that
 *  needs one — creating a document — so this stays deliberately plain rather
 *  than growing options nothing else uses. */
export function FileField({
  label,
  name,
  required,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="field field--wide">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input id={name} name={name} type="file" required={required ?? false} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null | undefined;
  hint?: string;
}) {
  return (
    <div className="field field--wide">
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} defaultValue={defaultValue ?? ''} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Select({
  label,
  name,
  id,
  options,
  defaultValue,
  required,
  hint,
  wide,
}: {
  label: string;
  name: string;
  /** See `Field`'s `id` — overrides the element's `id` without changing
   *  `name`, for the same reason: uniqueness across the page when the same
   *  field repeats once per row. Defaults to `name`. */
  id?: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | undefined;
  required?: boolean;
  hint?: string;
  wide?: boolean;
}) {
  const fieldId = id ?? name;
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={fieldId}
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required ?? false}
      >
        {required ? null : <option value="">—</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/**
 * The refusal, shown where the person is looking.
 *
 * `role="alert"` so it is announced rather than merely rendered — someone using
 * a screen reader would otherwise submit the form and hear nothing at all.
 */
export function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;

  return (
    <div className="alert" role="alert">
      {state.error}
      {state.fields && state.fields.length > 0 ? (
        <ul>
          {state.fields.map((field) => (
            <li key={field.field}>{field.reason}</li>
          ))}
        </ul>
      ) : null}
      {state.requestId ? (
        <div className="hint mono" style={{ marginTop: 'var(--space-2)' }}>
          Reference {state.requestId}
        </div>
      ) : null}
    </div>
  );
}

/** Disabled while submitting, so nobody double-creates a record by clicking twice. */
export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button" disabled={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export function CancelLink({ href }: { href: string }) {
  return (
    <Link href={href} className="button button--secondary">
      Cancel
    </Link>
  );
}

/**
 * A form wired to a server action, with its error state.
 *
 * The action returns a FormState rather than throwing, so a refusal from the
 * API becomes something the person can read and correct rather than an error
 * page that loses what they typed.
 */
export function ActionForm({
  action,
  submitLabel,
  cancelHref,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  cancelHref?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="stack">
      <ErrorBanner state={state} />
      {children}
      <div className="form-actions">
        <SubmitButton>{submitLabel}</SubmitButton>
        {cancelHref ? <CancelLink href={cancelHref} /> : null}
      </div>
    </form>
  );
}

/**
 * A single button that performs one action — archive, activate, close.
 *
 * `confirm` is used for the ones that are hard to walk back. It is a browser
 * dialogue rather than a bespoke modal: it cannot be dismissed by accident, it
 * works without JavaScript having hydrated, and nobody has to learn it.
 */
export function ActionButton({
  action,
  label,
  confirm,
  variant = 'secondary',
  hidden,
  disabledReason,
}: {
  action: () => Promise<void>;
  label: string;
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  hidden?: boolean;
  /** Shown as the button's title, and the button is disabled rather than
   *  submitting — the interface hides what someone may never do, but a
   *  precondition they can still go and satisfy is a reason, not a missing
   *  button (docs/phase-10-plan.md §6). */
  disabledReason?: string;
}) {
  if (hidden) return null;

  const className =
    variant === 'primary'
      ? 'button button--small'
      : variant === 'danger'
        ? 'button button--small button--danger'
        : 'button button--small button--secondary';

  if (disabledReason) {
    return (
      <button type="button" className={className} disabled title={disabledReason}>
        {label}
      </button>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm !== undefined && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
