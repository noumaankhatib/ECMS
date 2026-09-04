import {
  createMilestoneSchema,
  createPlanningActivitySchema,
  createSubmissionSchema,
  listQuerySchema,
  submissionTransitionSchema,
  updateMilestoneSchema,
  updatePlanningActivitySchema,
  updateSubmissionSchema,
  type CreateMilestone,
  type CreatePlanningActivity,
  type CreateSubmission,
  type ListQuery,
  type Page,
  type SubmissionTransition,
  type UpdateMilestone,
  type UpdatePlanningActivity,
  type UpdateSubmission,
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
import type { Milestone, PlanningActivity, Submission } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { ActivityService } from './activity.service';
import { MilestoneService } from './milestone.service';
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

  @Post(':id/status')
  @RequirePermission('planning:edit')
  transition(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submissionTransitionSchema)) body: SubmissionTransition,
  ): Promise<Submission> {
    return this.submissions.transition(projectId, id, body);
  }
}
