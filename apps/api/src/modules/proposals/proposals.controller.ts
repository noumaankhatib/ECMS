import {
  createProposalSchema,
  createProposalSketchTypeSchema,
  proposalListQuerySchema,
  proposalTransitionSchema,
  updateProposalSchema,
  updateProposalSketchTypeSchema,
  type CreateProposal,
  type CreateProposalSketchType,
  type Page,
  type ProposalListQuery,
  type ProposalTransition,
  type UpdateProposal,
  type UpdateProposalSketchType,
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
import type { Proposal, ProposalSketchType } from '@prisma/client';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { ProposalSketchTypeService } from './proposal-sketch-type.service';
import { ProposalService } from './proposal.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

@Controller('proposals')
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  @Get()
  @RequirePermission('proposal:view')
  list(
    @Query(new ZodValidationPipe(proposalListQuerySchema)) query: ProposalListQuery,
  ): Promise<Page<Proposal>> {
    return this.proposals.list(query);
  }

  @Get(':id')
  @RequirePermission('proposal:view')
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Proposal> {
    return this.proposals.byId(id);
  }

  @Post()
  @RequirePermission('proposal:create')
  create(
    @Body(new ZodValidationPipe(createProposalSchema)) body: CreateProposal,
    @Req() req: Request,
  ): Promise<Proposal> {
    return this.proposals.create(body, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('proposal:edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProposalSchema)) body: UpdateProposal,
    @Req() req: Request,
  ): Promise<Proposal> {
    return this.proposals.update(id, body, actorOf(req));
  }

  // ---------------------------------------------------------------------------
  // The status machine — one named action per route, no generic "set status".
  // WON → CONVERTED is reachable only via the dedicated convert action
  // (docs/phase-5-plan.md §4), not any of these.
  // ---------------------------------------------------------------------------

  @Post(':id/start-concept')
  @RequirePermission('proposal:edit')
  startConcept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'startConcept', body);
  }

  @Post(':id/send-for-client-review')
  @RequirePermission('proposal:edit')
  sendForClientReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'sendForClientReview', body);
  }

  @Post(':id/approve')
  @RequirePermission('proposal:edit')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'approve', body);
  }

  @Post(':id/win')
  @RequirePermission('proposal:edit')
  win(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'win', body);
  }

  @Post(':id/lose')
  @RequirePermission('proposal:edit')
  lose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'lose', body);
  }

  @Post(':id/hold')
  @RequirePermission('proposal:edit')
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'hold', body);
  }

  @Post(':id/resume')
  @RequirePermission('proposal:edit')
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
  ): Promise<Proposal> {
    return this.proposals.transition(id, 'resume', body);
  }

  /**
   * The one path from WON to CONVERTED. Gated by its own permission, not
   * `proposal:edit` — this is the action that creates a Project alongside
   * the status write, not an ordinary status move.
   */
  @Post(':id/convert')
  @RequirePermission('proposal:convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proposalTransitionSchema)) body: ProposalTransition,
    @Req() req: Request,
  ): Promise<Proposal> {
    return this.proposals.convert(id, body, actorOf(req));
  }
}

/**
 * The admin-configurable sketch-type pick list (docs/phase-5-plan.md §5c).
 *
 * There is no `sketch_type:view` permission — listing is gated by
 * `proposal:view` because anyone who can see proposals needs to see the
 * options they were logged against; only mutating it needs the dedicated
 * `sketch_type:admin` permission.
 */
@Controller('proposal-sketch-types')
export class ProposalSketchTypeController {
  constructor(private readonly sketchTypes: ProposalSketchTypeService) {}

  @Get()
  @RequirePermission('proposal:view')
  list(): Promise<ProposalSketchType[]> {
    return this.sketchTypes.list();
  }

  @Post()
  @RequirePermission('sketch_type:admin')
  create(
    @Body(new ZodValidationPipe(createProposalSketchTypeSchema)) body: CreateProposalSketchType,
  ): Promise<ProposalSketchType> {
    return this.sketchTypes.create(body);
  }

  @Patch(':id')
  @RequirePermission('sketch_type:admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProposalSketchTypeSchema)) body: UpdateProposalSketchType,
  ): Promise<ProposalSketchType> {
    return this.sketchTypes.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('sketch_type:admin')
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sketchTypes.archive(id);
  }
}
