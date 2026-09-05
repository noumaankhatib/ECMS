import {
  SUBMISSION_ACTIONS,
  canTransitionSubmission,
  type CreateSubmission,
  type ListQuery,
  type Page,
  type SubmissionAction,
  type SubmissionStatus,
  type SubmissionTransition,
  type UpdateSubmission,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Submission } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A planning authority application. Its status is the shared approval state
 * machine (docs/phase-3-plan.md §4) plus one submission-specific edge,
 * `WITHDRAWN` — not a one-off copy of it. `ApprovalStatus`/
 * `canTransitionApproval` live in `@ecms/contracts` for drawing revisions to
 * reuse later, the same way this module reuses them now.
 */
@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ListQuery): Promise<Page<Submission>> {
    const where: Prisma.SubmissionWhereInput = {
      projectId,
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { authorityName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.submission.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Submission> {
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission || submission.projectId !== projectId) throw appError('NOT_FOUND');
    return submission;
  }

  async create(projectId: string, input: CreateSubmission, actorId: string): Promise<Submission> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const submission = await tx.submission.create({
        data: {
          projectId,
          reference: input.reference,
          authorityName: input.authorityName,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Submission',
        entityId: submission.id,
        projectId,
        after: { reference: submission.reference, authorityName: submission.authorityName },
      });

      return submission;
    });
  }

  /** Reference, authority and notes only — status moves through `transition`. */
  async update(
    projectId: string,
    id: string,
    input: UpdateSubmission,
    _actorId: string,
  ): Promise<Submission> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.submission.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.SubmissionUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.submission.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_id: id } });

      const after = await tx.submission.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Submission',
        entityId: id,
        projectId,
        before: { reference: before.reference, authorityName: before.authorityName },
        after: { reference: after.reference, authorityName: after.authorityName },
      });

      return after;
    });
  }

  /**
   * Moves a submission to a new status. The named action decides the target,
   * the shared transition table decides whether the move is legal from where
   * the submission currently is, and the write is conditional on it still
   * being in that state — the same three-layer shape `ProjectService.transition`
   * established in Phase 1.
   *
   * `approve` alone is refused when the actor created the submission being
   * approved (docs/phase-3-plan.md §4's starting answer to B3) — a reviewer
   * rejecting or returning their own submission is not the conflict of
   * interest self-approval is, so only this one action carries the check.
   */
  async transition(
    projectId: string,
    id: string,
    action: SubmissionAction,
    input: SubmissionTransition,
    actorId: string,
  ): Promise<Submission> {
    const target: SubmissionStatus = SUBMISSION_ACTIONS[action];

    const current = await this.prisma.submission.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true, createdBy: true },
    });
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    if (action === 'approve' && current.createdBy === actorId) {
      throw appError('FORBIDDEN', { context: { submission_id: id, reason: 'self_approval' } });
    }

    const from = current.status as SubmissionStatus;
    if (!canTransitionSubmission(from, target)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Submission',
          entityId: id,
          projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: target },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [{ field: 'status', reason: `A submission cannot go from ${from} to ${target}.` }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.submission.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Submission',
        entityId: id,
        projectId,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.submission.findUniqueOrThrow({ where: { id } });
    });
  }
}
