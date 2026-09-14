import { Module } from '@nestjs/common';

import { AccessModule } from '../access';
import { DirectoryModule } from '../directory';
import { DocumentsModule } from '../documents';
import { HandoverModule } from '../handover';
import { ProjectsModule } from '../projects';
import { ProposalsModule } from '../proposals';
import { SupervisionModule } from '../supervision';

import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { ExportController, InsightsController } from './insights.controller';
import { NotificationsService } from './notifications.service';
import { SearchService } from './search.service';

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
  providers: [DashboardService, NotificationsService, SearchService, ExportService],
})
export class InsightsModule {}
