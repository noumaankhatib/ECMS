import {
  canTransitionWorkstream,
  type CreateWorkstream,
  type UpdateWorkstream,
  type WorkstreamStatus,
  type WorkstreamTransition,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Workstream } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * The work inside a project.
 *
 * Most projects never need one added by hand — the project's type opens the
 * right ones. These operations exist for the case where an engagement grows a
 * second discipline part way through.
 */
@Injectable()
export class WorkstreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProject(projectId: string): Promise<Workstream[]> {
    return this.prisma.workstream.findMany({ where: { projectId }, orderBy: { type: 'asc' } });
  }

  async create(projectId: string, input: CreateWorkstream): Promise<Workstream> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (!project) throw appError('NOT_FOUND');
      if (project.status === 'CLOSED') {
        throw appError('ILLEGAL_TRANSITION', {
          fields: [{ field: 'projectId', reason: 'This project is closed.' }],
        });
      }

      const workstream = await tx.workstream
        .create({
          data: { projectId, type: input.type, name: input.name, notes: input.notes ?? null },
        })
        .catch(rethrowDuplicateType);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Workstream',
        entityId: workstream.id,
        projectId,
        after: { type: workstream.type, name: workstream.name },
      });

      return workstream;
    });
  }

  /**
   * Name and notes only. Status is not a field a caller may write.
   *
   * `projectId` comes from the route and is checked against the record. The
   * permission guard decides access from the project in the URL, so without
   * this check a member of one project could pass another project's workstream
   * id and have it accepted — the guard would have approved the wrong project.
   */
  async update(projectId: string, id: string, input: UpdateWorkstream): Promise<Workstream> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.workstream.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const data: Prisma.WorkstreamUpdateManyMutationInput = { version: { increment: 1 } };
      if (input.name !== undefined) data.name = input.name;
      if (input.notes !== undefined) data.notes = input.notes;

      const { count } = await tx.workstream.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { workstream_id: id } });

      const after = await tx.workstream.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Workstream',
        entityId: id,
        projectId: before.projectId,
        before: { name: before.name },
        after: { name: after.name },
      });

      return after;
    });
  }

  /**
   * The same rule as a project: the transition table decides what is legal, the
   * write is conditional on the current state, and a refusal is recorded on its
   * own so the rollback cannot erase it.
   */
  async transition(
    projectId: string,
    id: string,
    input: WorkstreamTransition,
  ): Promise<Workstream> {
    const current = await this.prisma.workstream.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });
    // Same reasoning as `update`: the guard authorised the project in the URL,
    // so the record must actually be in it.
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    const from = current.status as WorkstreamStatus;
    if (!canTransitionWorkstream(from, input.to)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Workstream',
          entityId: id,
          projectId: current.projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: input.to },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [{ field: 'status', reason: `This work cannot go from ${from} to ${input.to}.` }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.workstream.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: input.to, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { workstream_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Workstream',
        entityId: id,
        projectId: current.projectId,
        before: { status: from },
        after: { status: input.to },
      });

      return tx.workstream.findUniqueOrThrow({ where: { id } });
    });
  }
}

function rethrowDuplicateType(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'type', reason: 'This project already has a workstream of that kind.' }],
    });
  }
  throw error;
}
