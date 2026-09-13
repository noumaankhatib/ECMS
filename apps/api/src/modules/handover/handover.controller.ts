import {
  updateHandoverChecklistSchema,
  type HandoverStatus,
  type UpdateHandoverChecklist,
} from '@ecms/contracts';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';

import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { HandoverService } from './handover.service';

/**
 * No new permission resource (docs/phase-10-plan.md §5) — this checklist is
 * one more fact about a project's own lifecycle, so it rides `project:*`
 * the same way `Modification` rides `planning:*`.
 */
@Controller('projects/:projectId/handover')
export class HandoverController {
  constructor(private readonly handover: HandoverService) {}

  @Get()
  @RequirePermission('project:view')
  status(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<HandoverStatus> {
    return this.handover.status(projectId);
  }

  @Patch()
  @RequirePermission('project:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(updateHandoverChecklistSchema)) body: UpdateHandoverChecklist,
  ): Promise<HandoverStatus> {
    return this.handover.update(projectId, body);
  }
}
