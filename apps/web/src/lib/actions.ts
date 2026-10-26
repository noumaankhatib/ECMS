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
          code: error.code,
          ...(error.fields.length > 0 ? { fields: error.fields } : {}),
          ...(error.requestId ? { requestId: error.requestId } : {}),
        },
      };
    }

    // Something unexpected (a bug, not a refusal). The person gets a plain
    // message and a reference to quote; the detail goes to the server log
    // under that same reference, and nothing here would help an attacker.
    const reference = crypto.randomUUID();
    console.error(`[action ${reference}]`, error);
    return {
      ok: false,
      state: { error: messageFor(unexpected()), code: 'INTERNAL', requestId: reference },
    };
  }
}

function unexpected(): ApiError {
  return new ApiError(500, 'INTERNAL', 'Something went wrong.');
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
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Sign in again, then repeat what you were doing.';
    case 'INVALID_CREDENTIALS':
      return 'Username, email or password is incorrect.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that. If you think you should, ask an administrator to check your role.';
    case 'NOT_FOUND':
      return 'This record no longer exists — it may have been archived or removed by someone else. Go back to the list and refresh it.';
    case 'VALIDATION_FAILED':
      // Nothing on the page is highlighted by this line; the list under it
      // names each field and what to change in it.
      return error.fields.length > 1
        ? 'Some details need fixing before this can be saved:'
        : error.fields.length === 1
          ? 'One detail needs fixing before this can be saved:'
          : 'Some of what was entered is not valid. Check the form and try again.';
    case 'CONFLICT':
      return 'This clashes with something that already exists or has just changed. Reload the page, check the current details, then try again.';
    case 'STALE_RECORD':
      return 'Somebody else changed this while you were editing. Reload the page and make your change again.';
    case 'ILLEGAL_TRANSITION':
      return (
        error.fields[0]?.reason ??
        'That is not allowed from the current status. Reload the page to see what is currently possible.'
      );
    case 'DEPENDENCY_EXISTS':
      return 'This cannot be done while other records still depend on it. Remove or reassign those records first, then try again.';
    case 'DUPLICATE_SUSPECTED':
      return 'A record with the same official identity already exists. Review the match below before saving.';
    case 'PRECONDITIONS_UNMET':
      return error.fields.length > 0
        ? 'This cannot be completed yet. Fix the following, then try again:'
        : 'This cannot be completed yet — some conditions are not met. Check the checklist on this page, then try again.';
    case 'HANDOVER_INCOMPLETE':
      return 'The handover checklist is not complete, so this project cannot be closed yet. Finish the open checklist items, then try again.';
    case 'RATE_LIMITED':
      return 'Too many attempts in a short time. Wait a minute, then try again.';
    case 'PAYLOAD_TOO_LARGE':
      return 'That file is too large to upload. Choose a smaller file, or compress it first.';
    case 'UNREACHABLE':
      return 'Could not reach the server. Check your connection and try again. If you were saving, look at the record first so it is not entered twice.';
    case 'UNAVAILABLE':
      return 'The server is busy or restarting. Wait a moment and try again.';
    case 'INTERNAL':
      return 'Something went wrong on our side, not with what you entered. Try again; if it keeps happening, quote the reference below.';
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
