import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { newRequestId, runInRequestContext } from '../context/request-context';

/**
 * Opens the request context and fixes the correlation id for this request.
 *
 * An inbound x-request-id is honoured so a call arriving from another system
 * keeps its trace, but only when it looks like a UUID — otherwise a caller
 * could inject arbitrary text into our logs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers['x-request-id'];
    const requestId = typeof inbound === 'string' && UUID.test(inbound) ? inbound : newRequestId();

    // Echoed back so a user can quote it in a support request.
    res.setHeader('x-request-id', requestId);

    runInRequestContext({ requestId }, () => {
      next();
    });
  }
}
