import {
  createDrawingRevisionSchema,
  createDrawingSchema,
  drawingListQuerySchema,
  drawingRevisionTransitionSchema,
  type CreateDrawing,
  type CreateDrawingRevision,
  type DrawingListQuery,
  type DrawingRevisionTransition,
  type Page,
} from '@ecms/contracts';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Drawing, DrawingRevision } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { DrawingRevisionService } from './drawing-revision.service';
import { DrawingService } from './drawing.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

@Controller('projects/:projectId/drawings')
export class DrawingController {
  constructor(private readonly drawings: DrawingService) {}

  @Get()
  @RequirePermission('drawing:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(drawingListQuerySchema)) query: DrawingListQuery,
  ): Promise<Page<Drawing>> {
    return this.drawings.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('drawing:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Drawing> {
    return this.drawings.byId(projectId, id);
  }

  @Post()
  @RequirePermission('drawing:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createDrawingSchema)) body: CreateDrawing,
    @Req() req: Request,
  ): Promise<Drawing> {
    return this.drawings.create(projectId, body, actorOf(req));
  }
}

/**
 * Nested two levels deep, the same shape supervision's observations and
 * instructions use — a project, and the drawing within it. There is no
 * update route: a revision is created, and moves only through the named
 * approval actions below (docs/phase-3-plan.md §5); nothing about its
 * content may ever change once written.
 */
@Controller('projects/:projectId/drawings/:drawingId/revisions')
export class DrawingRevisionController {
  constructor(private readonly revisions: DrawingRevisionService) {}

  @Get()
  @RequirePermission('drawing:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Query(new ZodValidationPipe(drawingListQuerySchema)) query: DrawingListQuery,
  ): Promise<Page<DrawingRevision>> {
    return this.revisions.list(projectId, drawingId, query);
  }

  @Get(':id')
  @RequirePermission('drawing:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DrawingRevision> {
    return this.revisions.byId(projectId, drawingId, id);
  }

  @Post()
  @RequirePermission('drawing:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Body(new ZodValidationPipe(createDrawingRevisionSchema)) body: CreateDrawingRevision,
    @Req() req: Request,
  ): Promise<DrawingRevision> {
    return this.revisions.create(projectId, drawingId, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Transitions. One route per named action — see phase-1-plan.md §5a.
  // `approve`, `reject` and `returnForRevision` are decisions and sit behind
  // `drawing:approve`; `submit` and `review` are ordinary progression and
  // sit behind `drawing:create` — the same permission that creates the
  // revision, since nothing about its content may be "edited" separately.
  // ---------------------------------------------------------------------------

  @Post(':id/submit')
  @RequirePermission('drawing:create')
  submit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(drawingRevisionTransitionSchema)) body: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    return this.revisions.transition(projectId, drawingId, id, 'submit', body);
  }

  @Post(':id/review')
  @RequirePermission('drawing:create')
  review(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(drawingRevisionTransitionSchema)) body: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    return this.revisions.transition(projectId, drawingId, id, 'review', body);
  }

  @Post(':id/approve')
  @RequirePermission('drawing:approve')
  approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(drawingRevisionTransitionSchema)) body: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    return this.revisions.transition(projectId, drawingId, id, 'approve', body);
  }

  @Post(':id/reject')
  @RequirePermission('drawing:approve')
  reject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(drawingRevisionTransitionSchema)) body: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    return this.revisions.transition(projectId, drawingId, id, 'reject', body);
  }

  @Post(':id/return-for-revision')
  @RequirePermission('drawing:approve')
  returnForRevision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('drawingId', ParseUUIDPipe) drawingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(drawingRevisionTransitionSchema)) body: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    return this.revisions.transition(projectId, drawingId, id, 'returnForRevision', body);
  }
}
