'use client';

import type { DuplicateMatch } from '@ecms/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { FormState } from '@/lib/form-state';

import styles from './duplicate-form.module.css';
import { CancelLink, ErrorBanner } from './form';

/** How each matched field is described to the person. */
const MATCHED_ON: Record<string, string> = {
  crNumber: 'same CR number',
  civilId: 'same Civil ID',
  plotNumber: 'same plot and wilayat',
  surveyReference: 'same Krookie serial',
  name: 'similar name',
  phone: 'same phone number',
};

/** Where "Update existing" leaves the new entry's values for the edit page. */
export const prefillKey = (basePath: string, id: string) => `ecms:prefill:${basePath}/${id}`;

/**
 * A create/edit form that stops to show possible duplicates before saving.
 *
 * Submitted through `onSubmit` rather than straight to the form's `action`
 * once JavaScript is running. React resets a form after an action submitted
 * that way, and here the person has to see the matches next to what they
 * typed, then choose — losing their input at that moment would defeat the
 * point. Before hydration the plain action still works; the API refuses an
 * identity match either way.
 */
export function DuplicateAwareForm({
  action,
  submitLabel,
  cancelHref,
  basePath,
  canEdit,
  canOverride,
  prefillFields,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  cancelHref: string;
  /** "/clients" or "/properties" — where a match's own pages live. */
  basePath: string;
  /** May update the matched record instead ("Update existing"). */
  canEdit: boolean;
  /** Holds directory:override_duplicate — may save over an identity match. */
  canOverride: boolean;
  /** Fields carried over to the existing record by "Update existing". */
  prefillFields: readonly string[];
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const updateExisting = (id: string) => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const values: Record<string, string> = {};
    for (const name of prefillFields) {
      const value = String(data.get(name) ?? '').trim();
      if (value !== '') values[name] = value;
    }
    // Not in the URL: these include Civil IDs, which would otherwise sit in
    // browser history and every access log between here and the server.
    sessionStorage.setItem(prefillKey(basePath, id), JSON.stringify(values));
    router.push(`${basePath}/${id}/edit`);
  };

  const matches = state.duplicates ?? [];

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        // The clicked button's name/value is how "create anyway" and
        // "override" are told apart from a first submission.
        const data = new FormData(event.currentTarget, event.nativeEvent.submitter);
        startTransition(() => formAction(data));
      }}
      className="stack"
    >
      <ErrorBanner state={state} />
      {children}
      {matches.length > 0 ? (
        <DuplicatePanel
          matches={matches}
          basePath={basePath}
          canEdit={canEdit}
          canOverride={canOverride}
          cancelHref={cancelHref}
          pending={pending}
          onUpdateExisting={updateExisting}
        />
      ) : (
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Working…' : submitLabel}
          </button>
          <CancelLink href={cancelHref} />
        </div>
      )}
    </form>
  );
}

function DuplicatePanel({
  matches,
  basePath,
  canEdit,
  canOverride,
  cancelHref,
  pending,
  onUpdateExisting,
}: {
  matches: readonly DuplicateMatch[];
  basePath: string;
  canEdit: boolean;
  canOverride: boolean;
  cancelHref: string;
  pending: boolean;
  onUpdateExisting: (id: string) => void;
}) {
  const exact = matches.some((m) => m.strength === 'EXACT');

  return (
    <section
      className={`${styles.panel} ${exact ? styles.exact : ''}`}
      role="alert"
      aria-labelledby="duplicate-heading"
    >
      <h3 id="duplicate-heading" className={styles.heading}>
        {exact ? 'This record already exists' : 'Possible duplicate found'}
      </h3>
      <p className={styles.lead}>
        {exact
          ? 'An existing record has the same official identity. Use or update it rather than creating a second one.'
          : 'These look similar to what you entered. Check they are not the same before creating a new one.'}
      </p>

      <ul className={styles.list}>
        {matches.map((match) => (
          <li key={match.id} className={styles.match}>
            <div>
              <span
                className={`badge badge--${match.strength === 'EXACT' ? 'critical' : 'warning'}`}
              >
                {match.strength === 'EXACT' ? 'Exact match' : 'Likely match'}
              </span>{' '}
              <Link href={`${basePath}/${match.id}`} target="_blank" className={styles.name}>
                {match.name}
              </Link>
              {match.reference ? <span className="mono"> · {match.reference}</span> : null}
              <div className="hint">
                {match.matchedOn.map((field) => MATCHED_ON[field] ?? field).join(', ')}
                {match.similarity !== null && match.matchedOn.includes('name')
                  ? ` (${String(Math.round(match.similarity * 100))}% alike)`
                  : null}
              </div>
            </div>
            <div className={styles.matchActions}>
              <Link
                href={`${basePath}/${match.id}`}
                className="button button--small button--secondary"
              >
                Use existing
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  className="button button--small button--secondary"
                  onClick={() => onUpdateExisting(match.id)}
                >
                  Update existing
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <CreateAnyway exact={exact} canEdit={canEdit} canOverride={canOverride} pending={pending} />

      <div className="form-actions">
        {/* Re-checks whatever is in the form now — for when the person has
            corrected a typo instead of choosing. */}
        <button
          type="submit"
          className="button button--secondary"
          disabled={pending}
          formNoValidate
        >
          Check again
        </button>
        <CancelLink href={cancelHref} />
      </div>
    </section>
  );
}

function CreateAnyway({
  exact,
  canEdit,
  canOverride,
  pending,
}: {
  exact: boolean;
  canEdit: boolean;
  canOverride: boolean;
  pending: boolean;
}) {
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => reasonRef.current?.focus(), []);

  if (!exact) {
    return (
      <div className="form-actions">
        <button
          type="submit"
          name="duplicateDecision"
          value="create"
          className="button"
          disabled={pending}
        >
          {pending ? 'Working…' : 'Not a duplicate — create anyway'}
        </button>
      </div>
    );
  }

  if (!canOverride) {
    return (
      <p className="hint">
        Only a System Administrator or Director can save a record over an exact match.{' '}
        {canEdit ? 'Use or update the existing one' : 'Use the existing one'}, or ask one of them.
      </p>
    );
  }

  return (
    <div className="stack">
      <div className="field field--wide">
        <label htmlFor="duplicateReason">
          Why is this not a duplicate?<span aria-hidden="true"> *</span>
        </label>
        <textarea
          ref={reasonRef}
          id="duplicateReason"
          name="duplicateReason"
          minLength={5}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby="duplicateReason-hint"
        />
        <span className="hint" id="duplicateReason-hint">
          Kept in the audit trail beside the new record.
        </span>
      </div>
      <div className="form-actions">
        <button
          type="submit"
          name="duplicateDecision"
          value="override"
          className="button button--danger"
          disabled={pending || reason.trim().length < 5}
        >
          {pending ? 'Working…' : 'Save anyway (override)'}
        </button>
      </div>
    </div>
  );
}

/**
 * On an edit page reached through "Update existing": copies the new entry's
 * values into the form's empty-or-different fields, once, and says so.
 */
export function PrefillFromDuplicate({ basePath, id }: { basePath: string; id: string }) {
  const [applied, setApplied] = useState<string[]>([]);

  useEffect(() => {
    const key = prefillKey(basePath, id);
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);

    const values = JSON.parse(raw) as Record<string, string>;
    const changedFields: string[] = [];
    for (const [name, value] of Object.entries(values)) {
      const input = document.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(`form [name="${CSS.escape(name)}"]`);
      if (input && input.value !== value) {
        input.value = value;
        changedFields.push(input.labels?.[0]?.textContent?.replace(' *', '') ?? name);
      }
    }
    setApplied(changedFields);
  }, [basePath, id]);

  if (applied.length === 0) return null;
  return (
    <div className={styles.notice} role="status">
      Filled in from your new entry: {applied.join(', ')}. Review, then save.
    </div>
  );
}
