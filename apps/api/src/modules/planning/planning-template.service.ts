import type {
  CreatePlanningTemplateItem,
  PlanningTemplateKind,
  UpdatePlanningTemplateItem,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { PlanningTemplateItem } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * The standard activities and milestones offered on the Planning page.
 *
 * A short reference list an administrator maintains by hand, the same shape as
 * the sketch-type list: no pagination or search. Entries are copied by name
 * into a project when someone applies them, so nothing here is referenced by a
 * project and a retired entry never changes existing work.
 */
@Injectable()
export class PlanningTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(kind?: PlanningTemplateKind): Promise<PlanningTemplateItem[]> {
    return this.prisma.planningTemplateItem.findMany({
      where: { archivedAt: null, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(input: CreatePlanningTemplateItem): Promise<PlanningTemplateItem> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.planningTemplateItem.findUnique({
        where: { kind_name: { kind: input.kind, name: input.name } },
      });
      // A retired entry with the same name is brought back rather than refused.
      const item = existing
        ? await tx.planningTemplateItem.update({
            where: { id: existing.id },
            data: { archivedAt: null, sortOrder: input.sortOrder },
          })
        : await tx.planningTemplateItem.create({
            data: { kind: input.kind, name: input.name, sortOrder: input.sortOrder },
          });
      if (existing && !existing.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'name', reason: 'That name is already on the list.' }],
        });
      }

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'PlanningTemplateItem',
        entityId: item.id,
        after: { kind: item.kind, name: item.name },
      });
      return item;
    });
  }

  async update(id: string, input: UpdatePlanningTemplateItem): Promise<PlanningTemplateItem> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.planningTemplateItem.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      const item = await tx.planningTemplateItem
        .update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        })
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === 'P2002') {
            throw appError('CONFLICT', {
              fields: [{ field: 'name', reason: 'That name is already on the list.' }],
            });
          }
          throw error;
        });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'PlanningTemplateItem',
        entityId: id,
        before: { name: before.name, sortOrder: before.sortOrder },
        after: { name: item.name, sortOrder: item.sortOrder },
      });
      return item;
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.planningTemplateItem.findUnique({ where: { id } });
      if (!existing) throw appError('NOT_FOUND');
      if (existing.archivedAt) return;

      await tx.planningTemplateItem.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'PlanningTemplateItem',
        entityId: id,
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}
