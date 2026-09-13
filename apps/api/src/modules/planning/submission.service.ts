import {
  SUBMISSION_ACTIONS,
  canTransitionSubmission,
  type CreateSubmission,
  type ListQuery,
  type Page,
  type SubmissionAction,
  type SubmissionRequestClarification,
  type SubmissionRespondClarification,
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
 * machine (docs/phase-3-plan.md §4) plus three submission-specific edges,
 * `WITHDRAWN`/`HALTED`/`CANCELLED` (docs/phase-6-plan.md §4) — not a one-off
 * copy of it. `ApprovalStatus`/`canTransitionApproval` live in `@ecms/contracts`
 * for drawing revisions to reuse later, the same way this module reuses them
 * now.
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
          department: input.department ?? 'PLANNING',
          pendingWith: input.pendingWith ?? null,
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
   *
   * `approve` also requires a `permitReference` (docs/phase-6-plan.md §4),
   * unless one was already recorded by an earlier approval attempt —
   * refused by name, the same way Phase 5's convert action refuses a missing
   * property. `halt` additionally records `preHaltStatus` so `resume` (below)
   * knows where to send the submission back to.
   */
  async transition(
    projectId: string,
    id: string,
    action: SubmissionAction,
    input: SubmissionTransition & { permitReference?: string | undefined },
    actorId: string,
  ): Promise<Submission> {
    const target: SubmissionStatus = SUBMISSION_ACTIONS[action];

    const current = await this.prisma.submission.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true, createdBy: true, permitReference: true },
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

    // Checked only once the move is otherwise legal — a submission never
    // eligible to approve at all should hear that reason first, the same
    // ordering rule Phase 5's convert action already applies (not-WON before
    // missing-property).
    const permitReference = input.permitReference ?? current.permitReference ?? null;
    if (action === 'approve' && !permitReference) {
      throw appError('CONFLICT', {
        fields: [
          {
            field: 'permitReference',
            reason: 'A permit reference is required to approve this submission.',
          },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const data: Prisma.SubmissionUpdateManyMutationInput = {
        status: target,
        version: { increment: 1 },
      };
      if (action === 'halt') data.preHaltStatus = from;
      if (action === 'approve') data.permitReference = permitReference;

      const { count } = await tx.submission.updateMany({
        where: { id, status: from, version: input.version },
        data,
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

  /**
   * `resume` is not in `SUBMISSION_ACTIONS` because its target is not fixed —
   * a submission halted from `SUBMITTED` resumes to `SUBMITTED`, one halted
   * from `UNDER_REVIEW` resumes to `UNDER_REVIEW` — so this reads
   * `preHaltStatus` rather than forcing a single-target action to describe a
   * two-target move (docs/phase-6-plan.md §4).
   */
  async resume(
    projectId: string,
    id: string,
    input: SubmissionTransition,
    _actorId: string,
  ): Promise<Submission> {
    const current = await this.prisma.submission.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true, preHaltStatus: true },
    });
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    const from = current.status as SubmissionStatus;
    const target = (current.preHaltStatus as SubmissionStatus | null) ?? 'SUBMITTED';

    if (!canTransitionSubmission(from, target)) {
      throw appError('ILLEGAL_TRANSITION', {
        fields: [{ field: 'status', reason: `A submission cannot go from ${from} to ${target}.` }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.submission.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, preHaltStatus: null, version: { increment: 1 } },
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

  /**
   * Clarification request/response (docs/phase-6-plan.md §4) never touches
   * `status` — a submission under review that needs clarification is still
   * `UNDER_REVIEW`, just with a flag raised.
   */
  async requestClarification(
    projectId: string,
    id: string,
    input: SubmissionRequestClarification,
    _actorId: string,
  ): Promise<Submission> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.submission.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { count } = await tx.submission.updateMany({
        where: { id, version: input.version },
        data: {
          clarificationRequested: true,
          clarificationRequestedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_id: id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Submission',
        entityId: id,
        projectId,
        after: { clarificationRequested: true },
      });

      return tx.submission.findUniqueOrThrow({ where: { id } });
    });
  }

  async respondClarification(
    projectId: string,
    id: string,
    input: SubmissionRespondClarification,
    _actorId: string,
  ): Promise<Submission> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.submission.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { count } = await tx.submission.updateMany({
        where: { id, version: input.version },
        data: {
          clarificationRequested: false,
          clarificationResponse: input.response,
          clarificationRespondedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_id: id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Submission',
        entityId: id,
        projectId,
        after: { clarificationRequested: false },
      });

      return tx.submission.findUniqueOrThrow({ where: { id } });
    });
  }
}
