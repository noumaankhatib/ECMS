import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'ecms_session';

/**
 * Session cookie settings, and why each one is here.
 *
 * httpOnly   JavaScript cannot read it, so a cross-site scripting flaw cannot
 *            steal the session.
 * sameSite   'strict' is our CSRF control. Browsers will not attach this cookie
 *            to any cross-site request. ECMS has no OAuth callback or external
 *            deep-link requirement that needs 'lax'.
 * secure     Controlled solely by COOKIE_SECURE env var. Set COOKIE_SECURE=false
 *            explicitly for local HTTP development; defaults to true (secure).
 *            NODE_ENV is a build-behaviour flag, not a security gate.
 * path       Sent for the whole application, and nothing above it.
 */
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['COOKIE_SECURE'] !== 'false',
    path: '/',
    expires: expiresAt,
  };
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['COOKIE_SECURE'] !== 'false',
    path: '/',
  });
}
