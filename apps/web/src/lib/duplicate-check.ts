import type { DuplicateMatch, DuplicateOverride } from '@ecms/contracts';

import { attempt } from './actions';
import type { FormState } from './form-state';

/**
 * Check for duplicates, and only save once the person has seen them.
 *
 * First submission: ask the API for matches. If there are any, nothing is
 * saved — the matches go back to the form, which offers Cancel / Use existing
 * / Update existing / Create anyway according to the person's permissions.
 *
 * Second submission carries `duplicateDecision`:
 *   "create"   — dismiss a likeness (name, phone). Needs nothing extra.
 *   "override" — save over an identity match (CR, Civil ID, plot). Sends the
 *                written reason; the API checks the override permission.
 *
 * The API enforces all of this again on the way in. This only decides when to
 * ask; it is not what stops a duplicate.
 */
export async function checkThenSave<T>(
  form: FormData,
  check: () => Promise<readonly DuplicateMatch[]>,
  save: (override: DuplicateOverride | undefined) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; state: FormState }> {
  const decision = form.get('duplicateDecision');

  if (decision !== 'create' && decision !== 'override') {
    const checked = await attempt(check);
    if (!checked.ok) return checked;
    if (checked.value.length > 0) return { ok: false, state: { duplicates: checked.value } };
  }

  const reason = String(form.get('duplicateReason') ?? '').trim();
  const saved = await attempt(() => save(decision === 'override' ? { reason } : undefined));
  if (saved.ok) return saved;

  // Keep the panel on screen after a refusal (a reason too short, or a match
  // that appeared in the meantime), so the person can still act on it.
  const again = await attempt(check);
  return {
    ok: false,
    state: {
      ...saved.state,
      ...(again.ok && again.value.length > 0 ? { duplicates: again.value } : {}),
    },
  };
}

/**
 * The value to check, but only when it differs from what the record already
 * had. On an edit, an identifier that was accepted before — possibly with an
 * override — must not be flagged again on every save.
 */
export function changed(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? '').trim();
  const original = String(form.get(`original_${name}`) ?? '').trim();
  return value !== '' && value !== original ? value : undefined;
}
