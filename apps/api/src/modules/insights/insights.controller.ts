import {
  WORKSTREAM_TYPES,
  searchQuerySchema,
  type ApprovalInboxItem,
  type DashboardSummary,
  type NotificationItem,
  type SearchQuery,
  type SearchResult,
  type WorkstreamStats,
  type WorkstreamType,
} from '@ecms/contracts';
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermissionAnywhere } from '../access';

import { ApprovalsInboxService } from './approvals-inbox.service';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { NotificationsService } from './notifications.service';
import { SearchService } from './search.service';
import { WorkstreamStatsService } from './workstream-stats.service';

const workstreamStatsQuerySchema = z.object({ type: z.enum(WORKSTREAM_TYPES) }).strict();
type WorkstreamStatsQuery = z.infer<typeof workstreamStatsQuerySchema>;

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Dashboard, notifications and search (docs/phase-11-plan.md §4–6) — none of
 * the three names a single gating permission, deliberately: each section or
 * result is independently gated inside its own service against the
 * permission its own resource already requires, so a caller who holds only
 * (say) `client:view` still reaches the endpoint and sees exactly the
 * Clients section, not a 403 for lacking `project:view`. Authentication
 * alone (the global `AuthGuard`) is the only thing standing between a
 * request and these routes.
 */
@Controller()
export class InsightsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly notifications: NotificationsService,
    private readonly search: SearchService,
    private readonly workstreamStats: WorkstreamStatsService,
    private readonly approvalsInbox: ApprovalsInboxService,
  ) {}

  @Get('dashboard')
  getDashboard(@Req() req: Request): Promise<DashboardSummary> {
    return this.dashboard.summary(actorOf(req));
  }

  /** The "Total projects" / "Open issues" cards on the top-level Planning
   *  and Supervision list pages — see WorkstreamStatsService for the
   *  BOTH-counts-toward-both rule. */
  @Get('insights/workstream-stats')
  @RequirePermissionAnywhere('project:view')
  getWorkstreamStats(
    @Query(new ZodValidationPipe(workstreamStatsQuerySchema)) query: WorkstreamStatsQuery,
    @Req() req: Request,
  ): Promise<WorkstreamStats> {
    return this.workstreamStats.forType(query.type as WorkstreamType, actorOf(req));
  }

  @Get('notifications')
  getNotifications(@Req() req: Request): Promise<NotificationItem[]> {
    return this.notifications.list(actorOf(req));
  }

  /** Cross-module list of items pending the caller's own approval — like
   *  `getNotifications` above, self-gated inside the service against each
   *  source's own permission, not a single route-level guard. */
  @Get('insights/approvals')
  getApprovalsInbox(@Req() req: Request): Promise<ApprovalInboxItem[]> {
    return this.approvalsInbox.list(actorOf(req));
  }

  @Get('search')
  getSearch(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
    @Req() req: Request,
  ): Promise<SearchResult[]> {
    return this.search.search(actorOf(req), query.q);
  }
}

/**
 * CSV export (docs/phase-11-plan.md §7) — one route per register, each rides
 * the exact permission its own list route already requires, not a shared
 * gate, since a caller may be able to export one register and not another.
 */
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('clients.csv')
  @RequirePermissionAnywhere('client:view')
  async clients(@Res() res: Response): Promise<void> {
    this.sendCsv(res, 'clients.csv', await this.exportService.clientsCsv());
  }

  @Get('properties.csv')
  @RequirePermissionAnywhere('property:view')
  async properties(@Res() res: Response): Promise<void> {
    this.sendCsv(res, 'properties.csv', await this.exportService.propertiesCsv());
  }

  @Get('projects.csv')
  @RequirePermissionAnywhere('project:view')
  async projects(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.sendCsv(res, 'projects.csv', await this.exportService.projectsCsv(actorOf(req)));
  }

  @Get('proposals.csv')
  @RequirePermissionAnywhere('proposal:view')
  async proposals(@Res() res: Response): Promise<void> {
    this.sendCsv(res, 'proposals.csv', await this.exportService.proposalsCsv());
  }

  @Get('issues.csv')
  @RequirePermissionAnywhere('issue:view')
  async issues(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.sendCsv(res, 'issues.csv', await this.exportService.issuesCsv(actorOf(req)));
  }

  private sendCsv(res: Response, filename: string, content: string): void {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(content);
  }
}
