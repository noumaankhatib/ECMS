/**
 * Insights — dashboard, notifications, search and CSV export
 * (docs/phase-11-plan.md).
 *
 * Owns nothing. The last module in the roadmap, and the only one with no
 * Prisma model of its own: everything it returns is computed, on every
 * request, from rows every earlier phase's own module already owns.
 * Depends on: access, directory, projects, proposals, documents, handover,
 * supervision — one import per resource it reads, never a second query
 * engine layered over them.
 */
export { InsightsModule } from './insights.module';
export { DashboardService } from './dashboard.service';
export { NotificationsService } from './notifications.service';
export { SearchService } from './search.service';
export { ExportService } from './export.service';
