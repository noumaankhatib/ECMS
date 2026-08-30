import { cookies } from 'next/headers';

/**
 * The only way this application talks to the API.
 *
 * Every call is made from the SERVER, never from the browser. Two things follow
 * from that, and both are the reason for it:
 *
 *   The session cookie is httpOnly. Browser JavaScript cannot read it, so a
 *   scripting flaw cannot carry it away. Fetching here, and forwarding the
 *   cookie explicitly, keeps that property instead of trading it for
 *   convenience.
 *
 *   The API's address is never published to the browser. In a deployment where
 *   the API is not publicly routable, this still works unchanged.
 *
 * Nothing here decides what a user may do. The API does that, on every request,
 * and this layer simply reports what it said.
 */

const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';
const SESSION_COOKIE = 'ecms_session';

/** A field the API objected to, safe to show the person who typed it. */
export interface FieldIssue {
  readonly field: string;
  readonly reason: string;
}

/**
 * A refusal from the API.
 *
 * Carries the machine-readable code as well as the message, because the caller
 * frequently needs to act on WHICH refusal it was — a stale record is offered a
 * reload, a conflict is not.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: readonly FieldIssue[];
  /** Echoed by the API so a person can quote it in a support request. */
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: readonly FieldIssue[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: FieldIssue[] };
  requestId?: string;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    // Never cached. Everything behind this is per-user and access-controlled;
    // a cache that did not understand that would serve one person's projects to
    // another, which is the exact failure the whole authorization model exists
    // to prevent.
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed: unknown = text === '' ? {} : JSON.parse(text);

  if (!response.ok) {
    const payload = parsed as ErrorBody;
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'INTERNAL',
      payload.error?.message ?? 'Something went wrong.',
      payload.error?.fields ?? [],
      payload.requestId,
    );
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};

/**
 * Signs in, and returns the cookie the API issued so the caller can set it.
 *
 * This one call cannot go through `request`, because the interesting part of
 * the response is the Set-Cookie header rather than the body.
 */
export async function login(
  email: string,
  password: string,
): Promise<{ setCookie: string | null }> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  const text = await response.text();
  const parsed: unknown = text === '' ? {} : JSON.parse(text);

  if (!response.ok) {
    const payload = parsed as ErrorBody;
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'INTERNAL',
      payload.error?.message ?? 'Something went wrong.',
      payload.error?.fields ?? [],
      payload.requestId,
    );
  }

  return { setCookie: response.headers.get('set-cookie') };
}

/** Parses the API's Set-Cookie so the value and expiry can be re-issued by Next. */
export function parseSessionCookie(
  header: string | null,
): { value: string; expires: Date | undefined } | null {
  if (!header) return null;

  const [pair, ...attributes] = header.split(';');
  const [name, ...rest] = (pair ?? '').split('=');
  if (name?.trim() !== SESSION_COOKIE) return null;

  const expiresAttribute = attributes
    .map((a) => a.trim())
    .find((a) => a.toLowerCase().startsWith('expires='));
  const expires = expiresAttribute
    ? new Date(expiresAttribute.slice('expires='.length))
    : undefined;

  return {
    value: rest.join('='),
    expires: expires && !Number.isNaN(expires.getTime()) ? expires : undefined,
  };
}

export { SESSION_COOKIE };
