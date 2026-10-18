import type { LoggerService } from '@nestjs/common';

import type { Logger } from './logger';

/**
 * Nest contexts whose `log`-level output is startup noise (one line per mapped
 * route, about 150 in total). They are kept, but at debug level.
 */
const NOISY_CONTEXTS = new Set(['RouterExplorer', 'RoutesResolver', 'InstanceLoader']);

/**
 * Sends the framework's own log calls through the application's pino instance,
 * so the console has one format instead of two.
 */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optional: unknown[]): void {
    const { context, extra } = split(optional);
    const level = context && NOISY_CONTEXTS.has(context) ? 'debug' : 'info';
    this.write(level, message, context, extra);
  }

  error(message: unknown, ...optional: unknown[]): void {
    // Nest passes (message, stack, context) for errors; the stack is a string.
    const { context, extra } = split(optional);
    this.write('error', message, context, extra);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    const { context, extra } = split(optional);
    this.write('warn', message, context, extra);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    const { context, extra } = split(optional);
    this.write('debug', message, context, extra);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    const { context, extra } = split(optional);
    this.write('trace', message, context, extra);
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    const { context, extra } = split(optional);
    this.write('fatal', message, context, extra);
  }

  private write(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: unknown,
    context: string | undefined,
    extra: unknown[],
  ): void {
    const fields: Record<string, unknown> = { source: 'nest' };
    if (context) fields['context'] = context;
    if (message instanceof Error) {
      fields['err'] = message;
    } else if (extra.length > 0) {
      fields['detail'] = extra.length === 1 ? extra[0] : extra;
    }
    this.logger[level](fields, message instanceof Error ? message.message : stringify(message));
  }
}

/** Nest appends the context name as the last string argument. */
function split(optional: unknown[]): { context: string | undefined; extra: unknown[] } {
  const last = optional[optional.length - 1];
  if (typeof last === 'string' && optional.length > 0) {
    return { context: last, extra: optional.slice(0, -1) };
  }
  return { context: undefined, extra: optional };
}

function stringify(message: unknown): string {
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}
