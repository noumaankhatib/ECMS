import {
  createMilestoneSchema,
  createPlanningActivitySchema,
  createSubmissionMeetingSchema,
  createSubmissionReviewSchema,
  createSubmissionSchema,
  listQuerySchema,
  submissionApproveSchema,
  submissionRequestClarificationSchema,
  submissionRespondClarificationSchema,
  submissionTransitionSchema,
  updateMilestoneSchema,
  updatePlanningActivitySchema,
  updateSubmissionMeetingSchema,
  updateSubmissionReviewSchema,
  updateSubmissionSchema,
  type CreateMilestone,
  type CreatePlanningActivity,
  type CreateSubmission,
  type CreateSubmissionMeeting,
  type CreateSubmissionReview,
  type ListQuery,
  type Page,
  type SubmissionApprove,
  type SubmissionRequestClarification,
  type SubmissionRespondClarification,
  type SubmissionTransition,
  type UpdateMilestone,
  type UpdatePlanningActivity,
  type UpdateSubmission,
  type UpdateSubmissionMeeting,
  type UpdateSubmissionReview,
} from '@ecms/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type {
  Milestone,
  PlanningActivity,
  Submission,
  SubmissionMeeting,
  SubmissionReview,
} from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { ActivityService } from './activity.service';
import { MilestoneService } from './milestone.service';
import { SubmissionMeetingService } from './submission-meeting.service';
import { SubmissionReviewService } from './submission-review.service';
import { SubmissionService } from './submission.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Every route here nests under a specific project — `:projectId` is what
 * `PermissionGuard` reads to decide access, and it is always present, unlike
 * the top-level project list. There is no "every planning activity across the
 * portfolio" endpoint, so the weaker `RequirePermissionAnywhere` layer Phase 1
 * needed for that case does not apply here.
 */
@Controller('projects/:projectId/planning/activities')
export class ActivityController {
  constructor(private readonly activities: ActivityService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<PlanningActivity>> {
    return this.activities.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlanningActivity> {
    return this.activities.byId(projectId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createPlanningActivitySchema)) body: CreatePlanningActivity,
    @Req() req: Request,
  ): Promise<PlanningActivity> {
    return this.activities.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePlanningActivitySchema)) body: UpdatePlanningActivity,
    @Req() req: Request,
  ): Promise<PlanningActivity> {
    return this.activities.update(projectId, id, body, actorOf(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('planning:edit')
  archive(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.activities.archive(projectId, id, actorOf(req));
  }
}

@Controller('projects/:projectId/planning/milestones')
export class MilestoneController {
  constructor(private readonly milestones: MilestoneService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<Milestone>> {
    return this.milestones.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Milestone> {
    return this.milestones.byId(projectId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createMilestoneSchema)) body: CreateMilestone,
    @Req() req: Request,
  ): Promise<Milestone> {
    return this.milestones.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema)) body: UpdateMilestone,
    @Req() req: Request,
  ): Promise<Milestone> {
    return this.milestones.update(projectId, id, body, actorOf(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('planning:edit')
  archive(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.milestones.archive(projectId, id, actorOf(req));
  }
}

@Controller('projects/:projectId/planning/submissions')
export class SubmissionController {
  constructor(private readonly submissions: SubmissionService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<Submission>> {
    return this.submissions.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Submission> {
    return this.submissions.byId(projectId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createSubmissionSchema)) body: CreateSubmission,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubmissionSchema)) body: UpdateSubmission,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.update(projectId, id, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Transitions. One route per named action, deliberately — see
  // phase-1-plan.md §5a and ProjectsController's identical shape. `approve` is
  // its own permission: it is the one action PRD §3 gives to a specific
  // authority (Planning Team and Director "and approvals"), not general editing.
  // ---------------------------------------------------------------------------

  @Post(':id/submit')
  @RequirePermission('planning:edit')
  submit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'submit', body, actorOf(req));
  }

  @Post(':id/review')
  @RequirePermission('planning:edit')
  review(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'review', body, actorOf(req));
  }

  @Post(':id/approve')
  @RequirePermission('planning:approve')
  approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionApproveSchema)) body: SubmissionApprove,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'approve', body, actorOf(req));
  }

  @Post(':id/reject')
  @RequirePermission('planning:approve')
  reject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'reject', body, actorOf(req));
  }

  @Post(':id/return-for-revision')
  @RequirePermission('planning:approve')
  returnForRevision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'returnForRevision', body, actorOf(req));
  }

  @Post(':id/withdraw')
  @RequirePermission('planning:edit')
  withdraw(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'withdraw', body, actorOf(req));
  }

  @Post(':id/halt')
  @RequirePermission('planning:edit')
  halt(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'halt', body, actorOf(req));
  }

  @Post(':id/resume')
  @RequirePermission('planning:edit')
  resume(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.resume(projectId, id, body, actorOf(req));
  }

  @Post(':id/cancel')
  @RequirePermission('planning:edit')
  cancel(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, 'cancel', body, actorOf(req));
  }

  @Post(':id/request-clarification')
  @RequirePermission('planning:edit')
  requestClarification(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionRequestClarificationSchema))
    body: SubmissionRequestClarification,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.requestClarification(projectId, id, body, actorOf(req));
  }

  @Post(':id/respond-clarification')
  @RequirePermission('planning:edit')
  respondClarification(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionRespondClarificationSchema))
    body: SubmissionRespondClarification,
    @Req() req: Request,
  ): Promise<Submission> {
    return this.submissions.respondClarification(projectId, id, body, actorOf(req));
  }
}

/**
 * Reviews and meetings always nest under a specific submission — there is no
 * standalone "all reviews across the portfolio" endpoint, matching
 * `ActivityController`'s own reasoning for why `RequirePermissionAnywhere`
 * does not apply here either. Both ride the existing `planning:*` verbs
 * (docs/phase-6-plan.md §6) rather than a new resource.
 */
@Controller('projects/:projectId/planning/submissions/:submissionId/reviews')
export class SubmissionReviewController {
  constructor(private readonly reviews: SubmissionReviewService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<SubmissionReview>> {
    return this.reviews.list(projectId, submissionId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubmissionReview> {
    return this.reviews.byId(projectId, submissionId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body(new ZodValidationPipe(createSubmissionReviewSchema)) body: CreateSubmissionReview,
    @Req() req: Request,
  ): Promise<SubmissionReview> {
    return this.reviews.create(projectId, submissionId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubmissionReviewSchema)) body: UpdateSubmissionReview,
    @Req() req: Request,
  ): Promise<SubmissionReview> {
    return this.reviews.update(projectId, submissionId, id, body, actorOf(req));
  }
}

@Controller('projects/:projectId/planning/submissions/:submissionId/meetings')
export class SubmissionMeetingController {
  constructor(private readonly meetings: SubmissionMeetingService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Page<SubmissionMeeting>> {
    return this.meetings.list(projectId, submissionId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubmissionMeeting> {
    return this.meetings.byId(projectId, submissionId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body(new ZodValidationPipe(createSubmissionMeetingSchema)) body: CreateSubmissionMeeting,
    @Req() req: Request,
  ): Promise<SubmissionMeeting> {
    return this.meetings.create(projectId, submissionId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubmissionMeetingSchema)) body: UpdateSubmissionMeeting,
    @Req() req: Request,
  ): Promise<SubmissionMeeting> {
    return this.meetings.update(projectId, submissionId, id, body, actorOf(req));
  }
}
