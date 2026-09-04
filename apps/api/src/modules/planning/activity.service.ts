import type {
  CreatePlanningActivity,
  ListQuery,
  Page,
  UpdatePlanningActivity,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { PlanningActivity, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A task within a project's planning workstream (PRD §6, "manage activities
 * and milestones"). No state machine — PRD gives this entity nothing to
 * validate beyond a plain done/not-done checkbox.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ListQuery): Promise<Page<PlanningActivity>> {
    const where: Prisma.PlanningActivityWhereInput = {
      projectId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.planningActivity.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.planningActivity.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<PlanningActivity> {
    const activity = await this.prisma.planningActivity.findUnique({ where: { id } });
    // Checked against the project in the URL, not merely that a row exists.
    // The permission guard authorised THIS project; a caller must not be able
    // to reach a record in another one by swapping the id in the path.
    if (!activity || activity.projectId !== projectId) throw appError('NOT_FOUND');
    return activity;
  }

  async create(
    projectId: string,
    input: CreatePlanningActivity,
    actorId: string,
  ): Promise<PlanningActivity> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const activity = await tx.planningActivity.create({
        data: {
          projectId,
          name: input.name,
          description: input.description ?? null,
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'PlanningActivity',
        entityId: activity.id,
        projectId,
        after: { name: activity.name },
      });

      return activity;
    });
  }

  async update(
    projectId: string,
    id: string,
    input: UpdatePlanningActivity,
    _actorId: string,
  ): Promise<PlanningActivity> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.planningActivity.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.PlanningActivityUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.planningActivity.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { activity_id: id } });

      const after = await tx.planningActivity.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'PlanningActivity',
        entityId: id,
        projectId,
        before: { name: before.name, done: before.done },
        after: { name: after.name, done: after.done },
      });

      return after;
    });
  }

  async archive(projectId: string, id: string, _actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const activity = await tx.planningActivity.findUnique({ where: { id } });
      if (!activity || activity.projectId !== projectId) throw appError('NOT_FOUND');
      if (activity.archivedAt) return;

      await tx.planningActivity.update({
        where: { id },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'PlanningActivity',
        entityId: id,
        projectId,
      });
    });
  }
}
