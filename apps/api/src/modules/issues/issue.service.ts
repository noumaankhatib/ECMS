import {
  canTransitionIssue,
  ISSUE_ACTIONS,
  type CreateIssue,
  type IssueAction,
  type IssueListQuery,
  type IssueStatus,
  type IssueTransition,
  type Page,
  type UpdateIssue,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Issue, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * The fourth state machine in the system (phase-1-plan.md §5a). Everything
 * else in this module is ordinary CRUD; `transition` is the one operation
 * that carries the same three-layer discipline `ProjectService.transition`
 * established: a named action, checked against a table, and a write
 * conditional on the state actually still being what was read.
 */
@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: IssueListQuery): Promise<Page<Issue>> {
    const where: Prisma.IssueWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.issue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.issue.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({ where: { id } });
    if (!issue || issue.projectId !== projectId) throw appError('NOT_FOUND');
    return issue;
  }

  async create(projectId: string, input: CreateIssue, actorId: string): Promise<Issue> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      if (input.observationId) {
        await this.requireObservationInProject(tx, projectId, input.observationId);
      }

      const issue = await tx.issue.create({
        data: {
          projectId,
          observationId: input.observationId ?? null,
          title: input.title,
          description: input.description ?? null,
          severity: input.severity,
          priority: input.priority,
          ownerId: input.ownerId ?? null,
          dueDate: input.dueDate ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Issue',
        entityId: issue.id,
        projectId,
        after: { title: issue.title, severity: issue.severity, priority: issue.priority },
      });

      return issue;
    });
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateIssue,
    _actorId: string,
  ): Promise<Issue> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.issue.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.IssueUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.issue.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { issue_id: id } });

      const after = await tx.issue.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Issue',
        entityId: id,
        projectId,
        before: { title: before.title, severity: before.severity, priority: before.priority },
        after: { title: after.title, severity: after.severity, priority: after.priority },
      });

      return after;
    });
  }

  /**
   * Moves an issue to a new status. The named action decides the target,
   * `canTransitionIssue` decides whether the move is legal from where the
   * issue currently is, and the write is conditional on the issue still
   * being in that state — the same mechanism that stops two people closing
   * the same project at once.
   *
   * A refused transition is recorded in a transaction of its own, since
   * nothing changed and the rollback of a failing transaction would take an
   * audit row with it.
   */
  async transition(
    projectId: string,
    id: string,
    action: IssueAction,
    input: IssueTransition,
  ): Promise<Issue> {
    const target: IssueStatus = ISSUE_ACTIONS[action];

    const current = await this.prisma.issue.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!current || current.projectId !== projectId) throw appError('NOT_FOUND');

    const from = current.status as IssueStatus;
    if (!canTransitionIssue(from, target)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Issue',
          entityId: id,
          projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: target },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [{ field: 'status', reason: `An issue cannot go from ${from} to ${target}.` }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.issue.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { issue_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Issue',
        entityId: id,
        projectId,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.issue.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * An observation belongs to a site visit, which belongs to a project — an
   * issue raised from one must be raised on the same project, or a caller
   * could point a project's issue at another project's site work.
   */
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
