import { describe, expect, it } from 'vitest';

import type { Logger } from './logger';
import { NestPinoLogger } from './nest-logger';

type Call = { level: string; fields: Record<string, unknown>; msg: string };

function fakeLogger(calls: Call[]): Logger {
  const at =
    (level: string) =>
    (fields: Record<string, unknown>, msg: string): void => {
      calls.push({ level, fields, msg });
    };
  return {
    trace: at('trace'),
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    fatal: at('fatal'),
  } as unknown as Logger;
}

describe('NestPinoLogger', () => {
  it('maps log to info and carries the Nest context name', () => {
    const calls: Call[] = [];
    new NestPinoLogger(fakeLogger(calls)).log('Nest application successfully started', 'NestApplication');
    expect(calls[0]).toMatchObject({
      level: 'info',
      msg: 'Nest application successfully started',
      fields: { context: 'NestApplication', source: 'nest' },
    });
  });

  it('downgrades route-mapping noise to debug', () => {
    const calls: Call[] = [];
    const logger = new NestPinoLogger(fakeLogger(calls));
    logger.log('Mapped {/export/clients.csv, GET} route', 'RouterExplorer');
    logger.log('ExportController {/export}:', 'RoutesResolver');
    expect(calls.map((c) => c.level)).toEqual(['debug', 'debug']);
  });

  it('keeps the stack as detail and the context for error calls', () => {
    const calls: Call[] = [];
    new NestPinoLogger(fakeLogger(calls)).error('boom', 'stack text', 'ExceptionHandler');
    expect(calls[0]).toMatchObject({
      level: 'error',
      fields: { context: 'ExceptionHandler', detail: 'stack text' },
    });
  });

  it('puts an Error object under err', () => {
    const calls: Call[] = [];
    const error = new Error('bad');
    new NestPinoLogger(fakeLogger(calls)).error(error);
    expect(calls[0]?.fields['err']).toBe(error);
    expect(calls[0]?.msg).toBe('bad');
  });

  it('maps verbose to trace and fatal to fatal', () => {
    const calls: Call[] = [];
    const logger = new NestPinoLogger(fakeLogger(calls));
    logger.verbose('v');
    logger.fatal('f');
    expect(calls.map((c) => c.level)).toEqual(['trace', 'fatal']);
  });
});
