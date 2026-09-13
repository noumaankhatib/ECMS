import type {
  CreateSubmissionReview,
  ListQuery,
  Page,
  UpdateSubmissionReview,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { SubmissionReview } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * One authority review round against a `Submission` (docs/phase-6-plan.md
 * §4/§5). A record of something that happened, not an entity with its own
 * lifecycle — create/list/update only, no transition table, never deleted
 * (the same posture `SiteVisit` already takes).
 */
@Injectable()
export class SubmissionReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async requireSubmission(projectId: string, submissionId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { projectId: true },
    });
    if (!submission || submission.projectId !== projectId) throw appError('NOT_FOUND');
  }

  async list(
    projectId: string,
    submissionId: string,
    query: ListQuery,
  ): Promise<Page<SubmissionReview>> {
    await this.requireSubmission(projectId, submissionId);

    const where = { submissionId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.submissionReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.submissionReview.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, submissionId: string, id: string): Promise<SubmissionReview> {
    await this.requireSubmission(projectId, submissionId);
    const review = await this.prisma.submissionReview.findUnique({ where: { id } });
    if (!review || review.submissionId !== submissionId) throw appError('NOT_FOUND');
    return review;
  }

  async create(
    projectId: string,
    submissionId: string,
    input: CreateSubmissionReview,
    actorId: string,
  ): Promise<SubmissionReview> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await this.requireSubmission(projectId, submissionId);

      const review = await tx.submissionReview.create({
        data: {
          submissionId,
          reviewDate: input.reviewDate,
          reviewerName: input.reviewerName ?? null,
          comments: input.comments ?? null,
          responseDueAt: input.responseDueAt ?? null,
          responseText: input.responseText ?? null,
          respondedAt: input.respondedAt ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'SubmissionReview',
        entityId: review.id,
        projectId,
        after: { submissionId, reviewDate: review.reviewDate },
      });

      return review;
    });
  }

  async update(
    projectId: string,
    submissionId: string,
    id: string,
    input: UpdateSubmissionReview,
    _actorId: string,
  ): Promise<SubmissionReview> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.submissionReview.findUnique({ where: { id } });
      if (!before || before.submissionId !== submissionId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Record<string, unknown> = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) data[key] = value;
      }

      const { count } = await tx.submissionReview.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_review_id: id } });

      const after = await tx.submissionReview.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'SubmissionReview',
        entityId: id,
        projectId,
        before: { comments: before.comments },
        after: { comments: after.comments },
      });

      return after;
    });
  }
}
