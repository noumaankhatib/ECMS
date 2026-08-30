import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';

import { currentRequestId } from '../context/request-context';
import { AppError, buildErrorResponse, isUnexpected } from '../errors/app-error';
import type { ErrorCode } from '../errors/error-catalogue';
import type { Logger } from '../logging/logger';

/**
 * Framework-raised HTTP errors (an unmatched route, a malformed body, a payload
 * that is too large) arrive as HttpException, not AppError. Map them onto the
 * catalogue so a client sees the same error shape and a meaningful code no
 * matter which layer refused the request.
 */
const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/**
 * The single exit point for every failure.
 *
 * Expected refusals (AppError) are logged at warn with their context and
 * returned to the caller with a stable code. Anything else is a genuine crash:
 * the stack is logged in full, and the caller receives a bare 500. Internal
 * detail never reaches the wire.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = currentRequestId();

    let status: number;
    let normalised: unknown = exception;

    if (exception instanceof AppError) {
      status = exception.status;
    } else if (exception instanceof HttpException) {
      // Framework-level refusals (malformed JSON, payload too large) are client
      // errors. Without this they would be counted as server crashes and would
      // pollute the error rate we alert on.
      status = exception.getStatus();
      normalised =
        status < 500 ? new AppError(STATUS_TO_CODE[status] ?? 'VALIDATION_FAILED') : exception;
    } else {
      status = 500;
    }

    if (isUnexpected(normalised)) {
      this.logger.error(
        { err: exception, status, event: 'request.failed' },
        'Unhandled exception serving request',
      );
    } else if (normalised instanceof AppError) {
      this.logger.warn(
        { error_code: normalised.code, status, ...normalised.context, event: 'request.refused' },
        'Request refused',
      );
    }

    response.status(status).json(buildErrorResponse(normalised, requestId));
  }
}
