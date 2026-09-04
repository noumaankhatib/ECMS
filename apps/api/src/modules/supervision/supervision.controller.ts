import {
  createInstructionSchema,
  createObservationSchema,
  createSiteVisitSchema,
  supervisionListQuerySchema,
  updateInstructionSchema,
  updateObservationSchema,
  updateSiteVisitSchema,
  type CreateInstruction,
  type CreateObservation,
  type CreateSiteVisit,
  type Page,
  type SupervisionListQuery,
  type UpdateInstruction,
  type UpdateObservation,
  type UpdateSiteVisit,
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
import type { Instruction, Observation, SiteVisit } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { InstructionService } from './instruction.service';
import { ObservationService } from './observation.service';
import { SiteVisitService } from './site-visit.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

/**
 * Every route nests under a specific project — `:projectId` is what
 * `PermissionGuard` reads to decide access, the same shape planning uses.
 * There is no update or archive here; a site visit that happened is simply a
 * fact from here on.
 */
@Controller('projects/:projectId/supervision/site-visits')
export class SiteVisitController {
  constructor(private readonly siteVisits: SiteVisitService) {}

  @Get()
  @RequirePermission('supervision:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(supervisionListQuerySchema)) query: SupervisionListQuery,
  ): Promise<Page<SiteVisit>> {
    return this.siteVisits.list(projectId, query);
  }

  @Get(':id')
  @RequirePermission('supervision:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SiteVisit> {
    return this.siteVisits.byId(projectId, id);
  }

  @Post()
  @RequirePermission('supervision:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createSiteVisitSchema)) body: CreateSiteVisit,
    @Req() req: Request,
  ): Promise<SiteVisit> {
    return this.siteVisits.create(projectId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('supervision:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSiteVisitSchema)) body: UpdateSiteVisit,
    @Req() req: Request,
  ): Promise<SiteVisit> {
    return this.siteVisits.update(projectId, id, body, actorOf(req));
  }
}

/**
 * Nested two levels deep — a project, and the site visit within it. Both are
 * checked: the permission guard authorises the project in the URL, and the
 * service separately confirms the site visit named in the URL actually
 * belongs to it, the same two-layer shape a workstream needed in Phase 1.
 */
@Controller('projects/:projectId/supervision/site-visits/:siteVisitId/observations')
export class ObservationController {
  constructor(private readonly observations: ObservationService) {}

  @Get()
  @RequirePermission('supervision:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Query(new ZodValidationPipe(supervisionListQuerySchema)) query: SupervisionListQuery,
  ): Promise<Page<Observation>> {
    return this.observations.list(projectId, siteVisitId, query);
  }

  @Get(':id')
  @RequirePermission('supervision:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observation> {
    return this.observations.byId(projectId, siteVisitId, id);
  }

  @Post()
  @RequirePermission('supervision:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Body(new ZodValidationPipe(createObservationSchema)) body: CreateObservation,
    @Req() req: Request,
  ): Promise<Observation> {
    return this.observations.create(projectId, siteVisitId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('supervision:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateObservationSchema)) body: UpdateObservation,
    @Req() req: Request,
  ): Promise<Observation> {
    return this.observations.update(projectId, siteVisitId, id, body, actorOf(req));
  }
}

@Controller('projects/:projectId/supervision/site-visits/:siteVisitId/instructions')
export class InstructionController {
  constructor(private readonly instructions: InstructionService) {}

  @Get()
  @RequirePermission('supervision:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Query(new ZodValidationPipe(supervisionListQuerySchema)) query: SupervisionListQuery,
  ): Promise<Page<Instruction>> {
    return this.instructions.list(projectId, siteVisitId, query);
  }

  @Get(':id')
  @RequirePermission('supervision:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Instruction> {
    return this.instructions.byId(projectId, siteVisitId, id);
  }

  @Post()
  @RequirePermission('supervision:create')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Body(new ZodValidationPipe(createInstructionSchema)) body: CreateInstruction,
    @Req() req: Request,
  ): Promise<Instruction> {
    return this.instructions.create(projectId, siteVisitId, body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('supervision:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteVisitId', ParseUUIDPipe) siteVisitId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInstructionSchema)) body: UpdateInstruction,
    @Req() req: Request,
  ): Promise<Instruction> {
    return this.instructions.update(projectId, siteVisitId, id, body, actorOf(req));
  }
}
