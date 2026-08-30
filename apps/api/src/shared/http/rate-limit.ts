import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import { appError } from '../errors/app-error';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * A small fixed-window rate limiter, held in memory.
 *
 * Scope, stated plainly: this protects a SINGLE running instance. The system is
 * sized for fewer than 50 users and runs as one process, so that is sufficient
 * today. If it is ever run as more than one instance, this must move to a
 * shared store — otherwise the effective limit multiplies by the instance
 * count. Recorded here rather than discovered later.
 */
@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly windows = new Map<string, Window>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // Without this the map grows for every distinct key ever seen, which is a
    // slow memory leak dressed up as a rate limiter.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /** Records an attempt, and throws once the limit is exceeded. */
  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > limit) {
      throw appError('RATE_LIMITED', {
        context: { rate_limit_key: key, limit, retry_after_ms: existing.resetAt - now },
      });
    }
  }

  /** Forgets a key — called after a successful sign-in, so one mistyped
   *  password does not count against someone for the rest of the window. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
