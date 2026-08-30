import { ERROR_CATALOGUE, type ErrorCode } from './error-catalogue';

/** Details safe to show a user — which field was wrong, and why. */
export interface FieldIssue {
  readonly field: string;
  readonly reason: string;
}

/**
 * The only error type the application throws deliberately.
 *
 * Anything else reaching the exception filter is treated as a genuine crash:
 * logged in full, reported to the caller as a bare 500.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: readonly FieldIssue[];
  /** Context for the log only. Never serialised to the client. */
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    options: { fields?: readonly FieldIssue[]; context?: Record<string, unknown> } = {},
  ) {
    const entry = ERROR_CATALOGUE[code];
    super(entry.message);
    this.name = 'AppError';
    this.code = code;
    this.status = entry.status;
    this.fields = options.fields ?? [];
    this.context = options.context ?? {};
  }
}

export const appError = (
  code: ErrorCode,
  options?: { fields?: readonly FieldIssue[]; context?: Record<string, unknown> },
): AppError => new AppError(code, options);

export interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fields?: readonly FieldIssue[];
  };
  /** Echoed so a user can quote it in a support request. */
  readonly requestId: string;
}

/**
 * The single place an error response is shaped. Both the exception filter and
 * the request logger use this, so what the client receives and what we record
 * can never drift apart.
 */
export function buildErrorResponse(error: unknown, requestId: string): ErrorResponseBody {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields.length > 0 ? { fields: error.fields } : {}),
      },
      requestId,
    };
  }
  // Unrecognised throw. The client is told nothing beyond "it failed".
  return {
    error: { code: 'INTERNAL', message: ERROR_CATALOGUE.INTERNAL.message },
    requestId,
  };
}

/** True when this should be logged as a crash rather than an expected refusal. */
export function isUnexpected(error: unknown): boolean {
  return !(error instanceof AppError) || error.status >= 500;
}
