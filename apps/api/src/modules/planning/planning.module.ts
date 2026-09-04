import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { ActivityService } from './activity.service';
import { MilestoneService } from './milestone.service';
import {
  ActivityController,
  MilestoneController,
  SubmissionController,
} from './planning.controller';
import { SubmissionService } from './submission.service';

@Module({
  imports: [AccessModule],
  controllers: [ActivityController, MilestoneController, SubmissionController],
  providers: [ActivityService, MilestoneService, SubmissionService],
  exports: [ActivityService, MilestoneService, SubmissionService],
})
export class PlanningModule {}
