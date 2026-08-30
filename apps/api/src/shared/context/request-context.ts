import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request state that every layer can read without it being threaded through
 * every function signature.
 *
 * The requestId here is the same value written to `audit_entry.request_id` and
 * stamped on every log line, so a support question ("what happened at 14:32?")
 * is answered by searching one identifier across both.
 */
export interface RequestContext {
  readonly requestId: string;
  /** Absent until authentication has run, and for anonymous requests. */
  userId?: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runInRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The current request id, or a fresh one when called outside a request
 * (scheduled jobs, CLI tooling). Never returns undefined — an audit row without
 * a correlation id is worse than one with a synthetic one.
 */
export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? randomUUID();
}

/** Records the authenticated user once auth has resolved it. */
export function setContextUserId(userId: string): void {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

export function newRequestId(): string {
  return randomUUID();
}
