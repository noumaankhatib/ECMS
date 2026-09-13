import { Module } from '@nestjs/common';

import { AccessModule } from '../access';

import { ActivityService } from './activity.service';
import { MilestoneService } from './milestone.service';
import {
  ActivityController,
  MilestoneController,
  SubmissionController,
  SubmissionMeetingController,
  SubmissionReviewController,
} from './planning.controller';
import { SubmissionMeetingService } from './submission-meeting.service';
import { SubmissionReviewService } from './submission-review.service';
import { SubmissionService } from './submission.service';

@Module({
  imports: [AccessModule],
  controllers: [
    ActivityController,
    MilestoneController,
    SubmissionController,
    SubmissionReviewController,
    SubmissionMeetingController,
  ],
  providers: [
    ActivityService,
    MilestoneService,
    SubmissionService,
    SubmissionReviewService,
    SubmissionMeetingService,
  ],
  exports: [
    ActivityService,
    MilestoneService,
    SubmissionService,
    SubmissionReviewService,
    SubmissionMeetingService,
  ],
})
export class PlanningModule {}
