import { randomUUID } from 'node:crypto';

import pino from 'pino';

import { getRequestContext } from '../context/request-context';

/**
 * Fields that may appear in a log line, by name.
 *
 * This is an ALLOW-LIST, deliberately. A deny-list ("redact password, token,
 * secret") only removes the sensitive fields somebody remembered to name, and
 * silently leaks every one they did not — client contact details, commercial
 * terms, addresses. Anything not listed here does not get logged.
 *
 * Adding a field is a conscious decision made in a pull request.
 */
const LOGGABLE_HEADERS = ['content-type', 'content-length', 'user-agent', 'referer'] as const;

export type Logger = pino.Logger;

export function createLogger(): Logger {
  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    // Stamped on every line, on every channel, automatically.
    mixin() {
      const ctx = getRequestContext();
      return ctx ? { request_id: ctx.requestId, user_id: ctx.userId ?? null } : {};
    },
    // Field keys are snake_case on the logging surface, distinct from the
    // camelCase used in the API and domain. Makes log queries unambiguous.
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...(process.env['NODE_ENV'] === 'development'
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  });
}

/** Reduces raw headers to the ones that are safe and useful to record. */
export function safeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of LOGGABLE_HEADERS) {
    const value = headers[name];
    if (typeof value === 'string') out[name.replace(/-/g, '_')] = value;
  }
  return out;
}

export function fallbackRequestId(): string {
  return randomUUID();
}
