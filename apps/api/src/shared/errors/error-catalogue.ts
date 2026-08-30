/**
 * Every error the API can deliberately return, in one place.
 *
 * Two rules make this work:
 *
 *   1. Call sites choose a CODE. They never write a message. That is why the
 *      same failure cannot be described three different ways in three places.
 *   2. The HTTP status lives here as data, not derived from the code string.
 *      Real status codes are used — 401, 403, 404, 409, 422 — because load
 *      balancers, browsers, retry logic and monitoring all read them.
 */
export const ERROR_CATALOGUE = {
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to do that.' },
  NOT_FOUND: { status: 404, message: 'The requested item does not exist.' },
  VALIDATION_FAILED: { status: 422, message: 'The submitted data is not valid.' },
  CONFLICT: { status: 409, message: 'That change conflicts with the current state.' },
  STALE_RECORD: {
    status: 409,
    message: 'Someone else changed this record. Reload and try again.',
  },
  ILLEGAL_TRANSITION: {
    status: 409,
    message: 'That change is not allowed from the current status.',
  },
  DEPENDENCY_EXISTS: {
    status: 409,
    message: 'This cannot be archived because other records depend on it.',
  },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please slow down.' },
  INTERNAL: { status: 500, message: 'Something went wrong.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;
