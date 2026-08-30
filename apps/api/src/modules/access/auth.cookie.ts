import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'ecms_session';

/**
 * Session cookie settings, and why each one is here.
 *
 * httpOnly   JavaScript cannot read it, so a cross-site scripting flaw cannot
 *            steal the session.
 * sameSite   'lax' is our CSRF control. Browsers will not attach this cookie to
 *            a cross-site POST, which is what a forged request would be. That
 *            plus the CORS allow-list covers it without a token scheme.
 * secure     HTTPS only, outside local development (PRD §14).
 * path       Sent for the whole application, and nothing above it.
 */
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    expires: expiresAt,
  };
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
  });
}
