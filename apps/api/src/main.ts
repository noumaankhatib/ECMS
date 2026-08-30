import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/http/all-exceptions.filter';
import type { Logger } from './shared/logging/logger';
import { LOGGER } from './shared/logging/logger.token';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get<Logger>(LOGGER);

  // Security headers and CORS are wired from the first commit rather than
  // retrofitted. The reference codebase had neither, which is defensible for a
  // machine-to-machine API behind a gateway and not defensible for anything a
  // browser talks to.
  app.use(helmet());
  app.use(cookieParser());

  const origins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    // An explicit list. Never a wildcard, because credentials are sent.
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();

  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen(port);
  logger.info({ event: 'server.started', port, cors_origins: origins }, 'API listening');
}

void bootstrap();
