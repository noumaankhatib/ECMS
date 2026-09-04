import {
  canTransitionSubmission,
  type CreateSubmission,
  type ListQuery,
  type Page,
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
 * A planning authority application. Stops at `SUBMITTED` in this phase — see
 * docs/phase-2-plan.md §2. There is no approval step here on purpose: the PRD
 * defines exactly one approval state machine shared across submissions,
 * drawings and documents, and that module is Phase 3. Building one just for
 * submissions now would be the first of three divergent copies of a rule that
 * should only ever be enforced in one place.
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
   * Moves a submission to `SUBMITTED` or `WITHDRAWN`.
   *
   * Small, like the workstream transition table in Phase 1 — real, and
   * enforced the same way, but not one of the four full state machines named
   * in `phase-1-plan.md` §5a. The write is conditional on the current status,
   * the same mechanism that stops two people acting on a project at once.
   */
  async transition(
    projectId: string,
    id: string,
    input: SubmissionTransition,
  ): Promise<Submission> {
    const current = await this.prisma.submission.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    const from = current.status as SubmissionStatus;
    if (!canTransitionSubmission(from, input.to)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Submission',
          entityId: id,
          projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: input.to },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [
          { field: 'status', reason: `A submission cannot go from ${from} to ${input.to}.` },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.submission.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: input.to, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Submission',
        entityId: id,
        projectId,
        before: { status: from },
        after: { status: input.to },
      });

      return tx.submission.findUniqueOrThrow({ where: { id } });
    });
  }
}
