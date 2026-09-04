import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { AccessModule } from './modules/access';
import { AuditModule } from './modules/audit';
import { DirectoryModule } from './modules/directory';
import { IssuesModule } from './modules/issues';
import { PlanningModule } from './modules/planning';
import { ProjectsModule } from './modules/projects';
import { SupervisionModule } from './modules/supervision';
import { DatabaseModule } from './shared/database/database.module';
import { HealthController } from './shared/http/health.controller';
import { HttpLoggerMiddleware } from './shared/http/http-logger.middleware';
import { RequestContextMiddleware } from './shared/http/request-context.middleware';
import { createLogger, type Logger } from './shared/logging/logger';
import { LOGGER } from './shared/logging/logger.token';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AccessModule,
    DirectoryModule,
    ProjectsModule,
    PlanningModule,
    SupervisionModule,
    IssuesModule,
  ],
  controllers: [HealthController],
  providers: [HttpLoggerMiddleware, { provide: LOGGER, useFactory: (): Logger => createLogger() }],
  exports: [LOGGER],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters. The request context must be open before anything logs,
    // otherwise log lines would carry no correlation id.
    consumer.apply(RequestContextMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
