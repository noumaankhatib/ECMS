import type {
  CreateSubmissionMeeting,
  ListQuery,
  Page,
  UpdateSubmissionMeeting,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { SubmissionMeeting } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * One authority meeting against a `Submission` (docs/phase-6-plan.md §4/§5).
 * Same posture as `SubmissionReviewService`: create/list/update only, no
 * transition table, never deleted.
 */
@Injectable()
export class SubmissionMeetingService {
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
  ): Promise<Page<SubmissionMeeting>> {
    await this.requireSubmission(projectId, submissionId);

    const where = { submissionId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.submissionMeeting.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.submissionMeeting.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, submissionId: string, id: string): Promise<SubmissionMeeting> {
    await this.requireSubmission(projectId, submissionId);
    const meeting = await this.prisma.submissionMeeting.findUnique({ where: { id } });
    if (!meeting || meeting.submissionId !== submissionId) throw appError('NOT_FOUND');
    return meeting;
  }

  async create(
    projectId: string,
    submissionId: string,
    input: CreateSubmissionMeeting,
    actorId: string,
  ): Promise<SubmissionMeeting> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await this.requireSubmission(projectId, submissionId);

      const meeting = await tx.submissionMeeting.create({
        data: {
          submissionId,
          required: input.required ?? false,
          meetingAt: input.meetingAt ?? null,
          attendees: input.attendees ?? null,
          purpose: input.purpose ?? null,
          outcome: input.outcome ?? null,
          heldAt: input.heldAt ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'SubmissionMeeting',
        entityId: meeting.id,
        projectId,
        after: { submissionId, meetingAt: meeting.meetingAt },
      });

      return meeting;
    });
  }

  async update(
    projectId: string,
    submissionId: string,
    id: string,
    input: UpdateSubmissionMeeting,
    _actorId: string,
  ): Promise<SubmissionMeeting> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.submissionMeeting.findUnique({ where: { id } });
      if (!before || before.submissionId !== submissionId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Record<string, unknown> = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) data[key] = value;
      }

      const { count } = await tx.submissionMeeting.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { submission_meeting_id: id } });

      const after = await tx.submissionMeeting.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'SubmissionMeeting',
        entityId: id,
        projectId,
        before: { outcome: before.outcome },
        after: { outcome: after.outcome },
      });

      return after;
    });
  }
}
