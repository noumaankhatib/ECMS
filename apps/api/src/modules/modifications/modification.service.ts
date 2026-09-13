import {
  canTransitionApproval,
  MODIFICATION_ACTIONS,
  type ApprovalStatus,
  type CreateModification,
  type ModificationAction,
  type ModificationListQuery,
  type ModificationTransition,
  type Page,
  type UpdateModification,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Modification, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A client-requested mid-construction change (docs/phase-8-plan.md),
 * optionally raised against a drawing revision and/or something seen on a
 * site visit. Status is `ApprovalStatus`, consumed directly — the same
 * treatment `DrawingRevision` gets, with no extra edge the way
 * `Submission`'s `WITHDRAWN` is.
 */
@Injectable()
export class ModificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ModificationListQuery): Promise<Page<Modification>> {
    const where: Prisma.ModificationWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { requestText: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.modification.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Modification> {
    const modification = await this.prisma.modification.findUnique({ where: { id } });
    if (!modification || modification.projectId !== projectId) throw appError('NOT_FOUND');
    return modification;
  }

  async create(
    projectId: string,
    input: CreateModification,
    actorId: string,
  ): Promise<Modification> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      if (input.drawingRevisionId) {
        await this.requireDrawingRevisionInProject(tx, projectId, input.drawingRevisionId);
      }
      if (input.observationId) {
        await this.requireObservationInProject(tx, projectId, input.observationId);
      }

      const modification = await tx.modification.create({
        data: {
          projectId,
          requestText: input.requestText,
          impactArea: input.impactArea,
          costImpact: input.costImpact ?? null,
          timeImpact: input.timeImpact ?? null,
          drawingRevisionId: input.drawingRevisionId ?? null,
          observationId: input.observationId ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Modification',
        entityId: modification.id,
        projectId,
        after: { requestText: modification.requestText, impactArea: modification.impactArea },
      });

      return modification;
    });
  }

  /** Content only — status moves through `transition`. */
  async update(
    projectId: string,
    id: string,
    input: UpdateModification,
    _actorId: string,
  ): Promise<Modification> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.modification.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.ModificationUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.modification.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { modification_id: id } });

      const after = await tx.modification.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Modification',
        entityId: id,
        projectId,
        before: { requestText: before.requestText, impactArea: before.impactArea },
        after: { requestText: after.requestText, impactArea: after.impactArea },
      });

      return after;
    });
  }

  /**
   * Moves a modification to a new status. The named action decides the
   * target, `canTransitionApproval` decides whether the move is legal from
   * where the modification currently is, and the write is conditional on it
   * still being in that state — the same three-layer shape every other
   * state machine in this system uses.
   */
  async transition(
    projectId: string,
    id: string,
    action: ModificationAction,
    input: ModificationTransition,
  ): Promise<Modification> {
    const target: ApprovalStatus = MODIFICATION_ACTIONS[action];

    const current = await this.prisma.modification.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    const from = current.status as ApprovalStatus;
    if (!canTransitionApproval(from, target)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Modification',
          entityId: id,
          projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: target },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [
          { field: 'status', reason: `A modification cannot go from ${from} to ${target}.` },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.modification.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { modification_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Modification',
        entityId: id,
        projectId,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.modification.findUniqueOrThrow({ where: { id } });
    });
  }

  /** The drawing revision named must belong to the same project, checked
   *  through its parent drawing — a two-hop lookup, the same shape
   *  `IssueService.requireObservationInProject` below already uses. */
  private async requireDrawingRevisionInProject(
    tx: Prisma.TransactionClient,
    projectId: string,
    drawingRevisionId: string,
  ): Promise<void> {
    const revision = await tx.drawingRevision.findUnique({
      where: { id: drawingRevisionId },
      select: { drawing: { select: { projectId: true } } },
    });
    if (!revision)
      throw appError('NOT_FOUND', { context: { drawing_revision_id: drawingRevisionId } });
    if (revision.drawing.projectId !== projectId) {
      throw appError('CONFLICT', {
        fields: [
          {
            field: 'drawingRevisionId',
            reason: 'That drawing revision does not belong to this project.',
          },
        ],
      });
    }
  }

  /** Same two-hop shape `IssueService` already uses for the same reason —
   *  an observation carries no `projectId` of its own, only through its
   *  site visit. */
  private async requireObservationInProject(
    tx: Prisma.TransactionClient,
    projectId: string,
    observationId: string,
  ): Promise<void> {
    const observation = await tx.observation.findUnique({
      where: { id: observationId },
      select: { siteVisit: { select: { projectId: true } } },
    });
    if (!observation) throw appError('NOT_FOUND', { context: { observation_id: observationId } });
    if (observation.siteVisit.projectId !== projectId) {
      throw appError('CONFLICT', {
        fields: [
          { field: 'observationId', reason: 'That observation does not belong to this project.' },
        ],
      });
    }
  }
}
