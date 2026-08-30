import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { safeHeaders, type Logger } from '../logging/logger';
import { LOGGER } from '../logging/logger.token';

/**
 * One line per completed request. Deliberately not one line per stage — the
 * correlation id already ties everything together.
 *
 * Only allow-listed headers are recorded. The full header set is never logged:
 * it carries cookies and authorization, and those would land on disk precisely
 * when something has gone wrong and the logs are being read.
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.info(
        {
          event: 'request.completed',
          method: req.method,
          // The route pattern, not the raw URL — a raw URL can carry
          // identifiers and search terms we would rather not retain.
          route: req.route?.path ?? req.path,
          status: res.statusCode,
          duration_ms: Math.round(durationMs * 100) / 100,
          headers: safeHeaders(req.headers as Record<string, unknown>),
        },
        'request completed',
      );
    });

    next();
  }
}
