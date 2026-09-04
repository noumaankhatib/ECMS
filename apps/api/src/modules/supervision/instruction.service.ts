import type {
  CreateInstruction,
  Page,
  SupervisionListQuery,
  UpdateInstruction,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Instruction, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject, requireSiteVisit } from './project-guard';

/**
 * A directive given on a site visit, with an owner and a due date (PRD §6).
 * `actionedAt` is set through a normal edit, the same treatment
 * `Milestone.achievedDate` gets — a date is either present or it is not, and
 * that is the whole state, so there is nothing here for a transition table.
 */
@Injectable()
export class InstructionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    siteVisitId: string,
    query: SupervisionListQuery,
  ): Promise<Page<Instruction>> {
    await requireSiteVisit(this.prisma, projectId, siteVisitId);

    const where: Prisma.InstructionWhereInput = {
      siteVisitId,
      ...(query.search ? { directiveText: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.instruction.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.instruction.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, siteVisitId: string, id: string): Promise<Instruction> {
    await requireSiteVisit(this.prisma, projectId, siteVisitId);

    const instruction = await this.prisma.instruction.findUnique({ where: { id } });
    if (!instruction || instruction.siteVisitId !== siteVisitId) throw appError('NOT_FOUND');
    return instruction;
  }

  async create(
    projectId: string,
    siteVisitId: string,
    input: CreateInstruction,
    actorId: string,
  ): Promise<Instruction> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await requireSiteVisit(tx, projectId, siteVisitId);

      const instruction = await tx.instruction.create({
        data: {
          siteVisitId,
          directiveText: input.directiveText,
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Instruction',
        entityId: instruction.id,
        projectId,
        after: { directiveText: instruction.directiveText },
      });

      return instruction;
    });
  }

  async update(
    projectId: string,
    siteVisitId: string,
    id: string,
    input: UpdateInstruction,
    _actorId: string,
  ): Promise<Instruction> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await requireSiteVisit(tx, projectId, siteVisitId);

      const before = await tx.instruction.findUnique({ where: { id } });
      if (!before || before.siteVisitId !== siteVisitId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.InstructionUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.instruction.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { instruction_id: id } });

      const after = await tx.instruction.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Instruction',
        entityId: id,
        projectId,
        before: { directiveText: before.directiveText, actionedAt: before.actionedAt },
        after: { directiveText: after.directiveText, actionedAt: after.actionedAt },
      });

      return after;
    });
  }
}
