import type { AuthenticatedUser } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      /** Set by AuthGuard. Present on every non-public route. */
      currentUser?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

export {};
