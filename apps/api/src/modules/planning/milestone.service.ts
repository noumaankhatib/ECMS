import type { CreateMilestone, ListQuery, Page, UpdateMilestone } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Milestone, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A date a project is working towards (PRD §6, "manage activities and
 * milestones"). Reaching one is recorded by setting `achievedDate`, not by a
 * status column — a date is either present or it is not, and that is the
 * whole state, so there is nothing here for a transition table to check.
 */
@Injectable()
export class MilestoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ListQuery): Promise<Page<Milestone>> {
    const where: Prisma.MilestoneWhereInput = {
      projectId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.milestone.findMany({
        where,
        orderBy: { targetDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.milestone.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Milestone> {
    const milestone = await this.prisma.milestone.findUnique({ where: { id } });
    if (!milestone || milestone.projectId !== projectId) throw appError('NOT_FOUND');
    return milestone;
  }

  async create(projectId: string, input: CreateMilestone, actorId: string): Promise<Milestone> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const milestone = await tx.milestone.create({
        data: {
          projectId,
          name: input.name,
          targetDate: input.targetDate ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Milestone',
        entityId: milestone.id,
        projectId,
        after: { name: milestone.name },
      });

      return milestone;
    });
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateMilestone,
    _actorId: string,
  ): Promise<Milestone> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.milestone.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.MilestoneUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.milestone.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { milestone_id: id } });

      const after = await tx.milestone.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Milestone',
        entityId: id,
        projectId,
        before: { name: before.name, achievedDate: before.achievedDate },
        after: { name: after.name, achievedDate: after.achievedDate },
      });

      return after;
    });
  }

  async archive(projectId: string, id: string, _actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const milestone = await tx.milestone.findUnique({ where: { id } });
      if (!milestone || milestone.projectId !== projectId) throw appError('NOT_FOUND');
      if (milestone.archivedAt) return;

      await tx.milestone.update({
        where: { id },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Milestone',
        entityId: id,
        projectId,
      });
    });
  }
}
