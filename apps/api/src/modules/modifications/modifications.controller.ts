import {
  createModificationSchema,
  modificationListQuerySchema,
  modificationTransitionSchema,
  updateModificationSchema,
  type CreateModification,
  type ModificationListQuery,
  type ModificationTransition,
  type Page,
  type UpdateModification,
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
import type { Modification } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { ModificationService } from './modification.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Rides the existing `planning:*` verbs (docs/phase-8-plan.md §6) — no new
 * resource, the same reasoning Phase 6 and Phase 7 used to avoid a
 * permission per new project-scoped record. `planning:approve` covers the
 * three decision actions, the same split `SubmissionController` already
 * draws between routine progression and a decision.
 */
@Controller('projects/:projectId/modifications')
export class ModificationController {
  constructor(private readonly modifications: ModificationService) {}

  @Get()
  @RequirePermission('planning:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(modificationListQuerySchema)) query: ModificationListQuery,
  ): Promise<Page<Modification>> {
    return this.modifications.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('planning:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Modification> {
    return this.modifications.byId(projectId, id);
  }

  @Post()
  @RequirePermission('planning:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createModificationSchema)) body: CreateModification,
    @Req() req: Request,
  ): Promise<Modification> {
    return this.modifications.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('planning:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateModificationSchema)) body: UpdateModification,
    @Req() req: Request,
  ): Promise<Modification> {
    return this.modifications.update(projectId, id, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // Transitions. One route per named action — see phase-1-plan.md §5a.
  // `approve`, `reject` and `returnForRevision` are decisions and sit behind
  // `planning:approve`; `submit` and `review` are ordinary progression and
  // sit behind `planning:edit` — the same split `SubmissionController` draws.
  // ---------------------------------------------------------------------------

  @Post(':id/submit')
  @RequirePermission('planning:edit')
  submit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modificationTransitionSchema)) body: ModificationTransition,
  ): Promise<Modification> {
    return this.modifications.transition(projectId, id, 'submit', body);
  }

  @Post(':id/review')
  @RequirePermission('planning:edit')
  review(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modificationTransitionSchema)) body: ModificationTransition,
  ): Promise<Modification> {
    return this.modifications.transition(projectId, id, 'review', body);
  }

  @Post(':id/approve')
  @RequirePermission('planning:approve')
  approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modificationTransitionSchema)) body: ModificationTransition,
  ): Promise<Modification> {
    return this.modifications.transition(projectId, id, 'approve', body);
  }

  @Post(':id/reject')
  @RequirePermission('planning:approve')
  reject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modificationTransitionSchema)) body: ModificationTransition,
  ): Promise<Modification> {
    return this.modifications.transition(projectId, id, 'reject', body);
  }

  @Post(':id/return-for-revision')
  @RequirePermission('planning:approve')
  returnForRevision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modificationTransitionSchema)) body: ModificationTransition,
  ): Promise<Modification> {
    return this.modifications.transition(projectId, id, 'returnForRevision', body);
  }
}
