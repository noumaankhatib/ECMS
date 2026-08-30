'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from './api';
import type { FormState } from './form-state';

/**
 * The one place an API refusal becomes something a person can read.
 *
 * Every server action runs through this. The alternative — each action catching
 * its own errors — is how one form ends up saying "Conflict" while another says
 * "That reference is already in use" for the same refusal.
 */
export async function runAction(work: () => Promise<void>): Promise<FormState> {
  const result = await attempt(work);
  return result.ok ? {} : result.state;
}

/**
 * As `runAction`, but keeps what the work returned.
 *
 * Creating something and then navigating to it needs the new record's id, and a
 * helper that could only report success or failure forced the caller into
 * assigning to a variable from inside a closure and then asserting it was set.
 */
export async function attempt<T>(
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; state: FormState }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    // A redirect is thrown, by design, and must not be treated as a failure.
    if (isRedirect(error)) throw error;

    if (error instanceof ApiError) {
      return {
        ok: false,
        state: {
          error: messageFor(error),
          ...(error.fields.length > 0 ? { fields: error.fields } : {}),
          ...(error.requestId ? { requestId: error.requestId } : {}),
        },
      };
    }

    // Something unexpected. The person is told it failed and given nothing that
    // would only help an attacker.
    return { ok: false, state: { error: 'Something went wrong. Please try again.' } };
  }
}

/**
 * Turns a code into a sentence that tells the person what to do next.
 *
 * The API's own message is used unless there is something more useful to say.
 * "That change conflicts with the current state" is accurate and unhelpful;
 * "Reload and try again" is what the person actually needs to hear.
 */
function messageFor(error: ApiError): string {
  switch (error.code) {
    case 'STALE_RECORD':
      return 'Somebody else changed this while you were editing. Reload the page and make your change again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Sign in again.';
    case 'ILLEGAL_TRANSITION':
      return error.fields[0]?.reason ?? 'That is not allowed from the current status.';
    case 'DEPENDENCY_EXISTS':
      return 'This cannot be done while other records depend on it.';
    case 'VALIDATION_FAILED':
      return 'Please check the highlighted fields.';
    default:
      return error.message;
  }
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

/** Reads a text field, treating blank as "not given". */
export async function text(form: FormData, name: string): Promise<string | undefined> {
  const value = form.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** As `text`, but blank means "clear this field" rather than "leave it alone". */
export async function nullableText(form: FormData, name: string): Promise<string | null> {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function refresh(path: string): Promise<void> {
  revalidatePath(path, 'layout');
}

export async function go(path: string): Promise<never> {
  redirect(path);
}
