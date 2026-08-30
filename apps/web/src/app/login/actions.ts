'use server';

import { loginRequestSchema } from '@ecms/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { login, parseSessionCookie, SESSION_COOKIE } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

/**
 * Signs in.
 *
 * The session cookie the API issued is re-set by Next on its own origin, so the
 * browser never has to talk to the API directly and the cookie stays httpOnly
 * throughout.
 *
 * Every failure says the same thing, deliberately. A wrong password, an unknown
 * address and a disabled account are indistinguishable here — as they are in
 * the API — because telling them apart turns this form into a way of finding
 * out who works here.
 */
export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = loginRequestSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Enter your email address and password.' };
  }

  let setCookie: string | null;
  try {
    ({ setCookie } = await login(parsed.data.email, parsed.data.password));
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'RATE_LIMITED') {
        return { error: 'Too many attempts. Wait a few minutes and try again.' };
      }
      return { error: 'Email or password is incorrect.' };
    }
    return { error: 'Could not reach the server. Try again shortly.' };
  }

  const parsedCookie = parseSessionCookie(setCookie);
  if (!parsedCookie) return { error: 'Sign-in did not complete. Try again.' };

  const store = await cookies();
  store.set(SESSION_COOKIE, parsedCookie.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(parsedCookie.expires ? { expires: parsedCookie.expires } : {}),
  });

  redirect('/projects');
}

/** Ends the session at the API as well as in this browser. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;

  if (session) {
    // Told to the API too, so the session is genuinely revoked rather than
    // merely forgotten by this browser.
    await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/auth/logout`, {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  store.delete(SESSION_COOKIE);
  redirect('/login');
}
