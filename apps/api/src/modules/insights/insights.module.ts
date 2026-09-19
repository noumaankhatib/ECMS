import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { DirectoryModule } from '../directory';
import { DocumentsModule } from '../documents';
import { HandoverModule } from '../handover';
import { ProjectsModule } from '../projects';
import { ProposalsModule } from '../proposals';
import { SupervisionModule } from '../supervision';

import { ApprovalsInboxService } from './approvals-inbox.service';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { ExportController, InsightsController } from './insights.controller';
import { NotificationsService } from './notifications.service';
import { SearchService } from './search.service';
import { WorkstreamStatsService } from './workstream-stats.service';

@Module({
  imports: [
    AccessModule,
    DirectoryModule,
    ProjectsModule,
    ProposalsModule,
    DocumentsModule,
    HandoverModule,
    SupervisionModule,
  ],
  controllers: [InsightsController, ExportController],
  providers: [
    ApprovalsInboxService,
    DashboardService,
    NotificationsService,
    SearchService,
    ExportService,
    WorkstreamStatsService,
  ],
})
export class InsightsModule {}
