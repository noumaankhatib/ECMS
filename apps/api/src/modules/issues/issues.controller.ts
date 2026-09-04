import {
  createIssueSchema,
  issueListQuerySchema,
  issueTransitionSchema,
  updateIssueSchema,
  type CreateIssue,
  type IssueListQuery,
  type IssueTransition,
  type Page,
  type UpdateIssue,
} from '@ecms/contracts';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Issue } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { IssueService } from './issue.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Every route nests under a specific project, the same shape planning and
 * supervision use. Transitions are one route per named action — there is no
 * "set the status" endpoint, because status is not a field a caller may
 * write (phase-1-plan.md §5a).
 */
@Controller('projects/:projectId/issues')
export class IssuesController {
  constructor(private readonly issues: IssueService) {}

  @Get()
  @RequirePermission('issue:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(issueListQuerySchema)) query: IssueListQuery,
  ): Promise<Page<Issue>> {
    return this.issues.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('issue:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Issue> {
    return this.issues.byId(projectId, id);
  }

  @Post()
  @RequirePermission('issue:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createIssueSchema)) body: CreateIssue,
    @Req() req: Request,
  ): Promise<Issue> {
    return this.issues.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('issue:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIssueSchema)) body: UpdateIssue,
    @Req() req: Request,
  ): Promise<Issue> {
    return this.issues.update(projectId, id, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Transitions. One route per named action, deliberately — see phase-1-plan.md
  // §5a and ProjectsController's identical shape.
  // ---------------------------------------------------------------------------

  @Post(':id/start')
  @RequirePermission('issue:edit')
  start(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(issueTransitionSchema)) body: IssueTransition,
  ): Promise<Issue> {
    return this.issues.transition(projectId, id, 'start', body);
  }

  @Post(':id/resolve')
  @RequirePermission('issue:edit')
  resolve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(issueTransitionSchema)) body: IssueTransition,
  ): Promise<Issue> {
    return this.issues.transition(projectId, id, 'resolve', body);
  }

  /** Closing is its own permission — PRD §3 gives it to Supervision Team by name. */
  @Post(':id/close')
  @RequirePermission('issue:close')
  close(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(issueTransitionSchema)) body: IssueTransition,
  ): Promise<Issue> {
    return this.issues.transition(projectId, id, 'close', body);
  }

  @Post(':id/reopen')
  @RequirePermission('issue:edit')
  reopen(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(issueTransitionSchema)) body: IssueTransition,
  ): Promise<Issue> {
    return this.issues.transition(projectId, id, 'reopen', body);
  }
}
