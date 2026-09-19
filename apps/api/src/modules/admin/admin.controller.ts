import {
  adminArchiveSchema,
  adminHardDeleteSchema,
  type AdminArchive,
  type AdminHardDelete,
  type ImpactTree,
} from '@ecms/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { AdminDeleteService } from './admin-delete.service';
import { ImpactService } from './impact.service';

function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly impact: ImpactService,
    private readonly deleter: AdminDeleteService,
  ) {}

  @Get('impact/:type/:id')
  @RequirePermission('admin:data')
  async getImpact(
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<ImpactTree> {
    return this.impact.forEntity(type, id);
  }

  @Post('archive')
  @HttpCode(204)
  @RequirePermission('admin:data')
  async archive(
    @Body(new ZodValidationPipe(adminArchiveSchema)) body: AdminArchive,
    @Req() req: Request,
  ): Promise<void> {
    await this.deleter.archive(body.items, actorOf(req));
  }

  @Post('hard-delete')
  @HttpCode(204)
  @RequirePermission('admin:data')
  async hardDelete(
    @Body(new ZodValidationPipe(adminHardDeleteSchema)) body: AdminHardDelete,
    @Req() req: Request,
  ): Promise<void> {
    const root = body.items[0];
    if (!root) throw appError('VALIDATION_FAILED', { fields: [{ field: 'items', reason: 'At least one item required.' }] });

    // Fetch the root label for confirm-name validation
    const tree = await this.impact.forEntity(root.type, root.id).catch(() => null);
    const rootLabel = tree?.root.label ?? '';

    await this.deleter.hardDelete(body.items, body.confirmName, rootLabel, actorOf(req));
  }
}
