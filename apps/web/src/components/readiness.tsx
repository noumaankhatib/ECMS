import type { GateReadiness } from '@ecms/contracts';
import Link from 'next/link';

import type { FormState } from '@/lib/form-state';

import { ActionForm } from './form';
import { CheckIcon, CloseIcon } from './icons';

/**
 * What completing something still depends on — the API's own completion
 * gate (`GET /projects/:id/readiness`), shown beside the button it gates, so
 * nobody has to press it to find out. Each unmet check links to the page
 * where it can be dealt with.
 */
export function ReadinessList({
  readiness,
  title,
  links = {},
}: {
  readiness: GateReadiness;
  title: string;
  /** Where to go to clear a check, keyed by the check's `key`. */
  links?: Record<string, string>;
}) {
  const met = readiness.checks.filter((check) => check.met).length;
  return (
    <div className={`readiness ${readiness.ready ? 'readiness--ready' : ''}`}>
      <p className="readiness__title">
        <strong>{title}</strong>
        <span>
          {readiness.ready ? 'Ready' : `${met} of ${readiness.checks.length} conditions met`}
        </span>
      </p>
      <ul className="readiness__checks">
        {readiness.checks.map((check) => (
          <li
            key={check.key}
            className={check.met ? 'readiness__check--met' : 'readiness__check--unmet'}
          >
            <span className="readiness__icon" aria-hidden="true">
              {check.met ? (
                <CheckIcon width={12} height={12} />
              ) : (
                <CloseIcon width={12} height={12} />
              )}
            </span>
            <span className="readiness__text">
              <span className="sr-only">{check.met ? 'Met: ' : 'Not met: '}</span>
              {check.label}
              {!check.met && check.detail ? (
                <span className="readiness__detail">
                  {check.detail}{' '}
                  {links[check.key] ? (
                    <Link href={links[check.key] as string}>Go there</Link>
                  ) : null}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Director/Administrator escape hatch: complete despite unmet
 * conditions, with a written reason. Collapsed by default so it reads as the
 * exception it is; the API checks `workflow:override_gate` again and records
 * the reason and what was unmet in the audit trail.
 */
export function OverrideForm({
  id,
  action,
  hidden,
  label = 'Complete anyway…',
}: {
  /** Unique on the page — there may be one per workstream. */
  id: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string | number>;
  label?: string;
}) {
  const fieldId = `${id}-reason`;
  return (
    <details className="override">
      <summary>{label}</summary>
      <ActionForm action={action} submitLabel="Complete anyway">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="field field--wide">
          <label htmlFor={fieldId}>Reason for overriding</label>
          <textarea id={fieldId} name="reason" required minLength={5} maxLength={500} />
          <span className="hint">
            Recorded in the audit trail, together with the conditions that were not met.
          </span>
        </div>
      </ActionForm>
    </details>
  );
}
