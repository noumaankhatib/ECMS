import {
  PROJECT_ACTIONS,
  WORKSTREAMS_FOR_TYPE,
  canTransitionProject,
  isProjectReadOnly,
  type CreateProject,
  type Page,
  type ProjectAction,
  type ProjectListQuery,
  type ProjectStatus,
  type ProjectTransition,
  type UpdateProject,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Project } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import type { Tx } from '../../shared/database/transaction';
import { appError } from '../../shared/errors/app-error';
import { AuthorizationService } from '../access';
import { AuditService } from '../audit';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
  ) {}

  /**
   * The projects this caller may see — and only those.
   *
   * This is the second layer of the authorization model, and the one the plan
   * calls the critical test. The filter is applied to the query itself rather
   * than to its results, so a caller who belongs to nothing receives an empty
   * page from the database, not a filtered-down version of everyone's work.
   *
   * `visibleProjectIds` returning `null` means "no restriction" — a Director or
   * an Administrator holds `project:view` across the portfolio.
   */
  async list(query: ProjectListQuery, userId: string): Promise<Page<Project>> {
    const visible = await this.authorization.visibleProjectIds(userId, 'project:view');
    if (visible !== null && visible.length === 0) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.ProjectWhereInput = {
      ...(visible === null ? {} : { id: { in: visible } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * A single project, scoped the same way as the list.
   *
   * PermissionGuard has already refused a non-member by the time this runs, so
   * this check is the second, independent layer rather than the first. It exists
   * for the case the guard is missed — a new route, a direct service call — and
   * it answers NOT_FOUND, because a caller who has got this far without being
   * entitled to the project should not learn from us that it exists.
   */
  async byId(id: string, userId: string): Promise<Project> {
    const visible = await this.authorization.visibleProjectIds(userId, 'project:view');
    if (visible !== null && !visible.includes(id)) throw appError('NOT_FOUND');

    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw appError('NOT_FOUND');
    return project;
  }

  /**
   * Opens a project.
   *
   * Two things happen alongside the row itself, both in the same transaction:
   *
   *  - The creator is added as a member. Without it, a Project Manager could
   *    create a project and then immediately be refused permission to edit it,
   *    because `project:edit` is PROJECT-scoped and they would belong to
   *    nothing. Creating something you cannot then touch is not a sensible
   *    outcome, and working around it later by widening the permission would
   *    undo the whole model.
   *
   *  - The workstreams named by the project's type are opened. A Supervision
   *    project therefore cannot quietly contain no supervision work.
   */
  async create(input: CreateProject, actorId: string): Promise<Project> {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: input.propertyId },
        select: { id: true, clientId: true, archivedAt: true },
      });
      if (!property) {
        throw appError('NOT_FOUND', { context: { property_id: input.propertyId } });
      }
      if (property.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'propertyId', reason: 'That property has been archived.' }],
        });
      }
      // The property already knows its client. Accepting a clientId that
      // contradicts it would let a project claim to belong to one customer
      // while sitting on another's site.
      if (property.clientId !== input.clientId) {
        throw appError('CONFLICT', {
          fields: [
            { field: 'propertyId', reason: 'That property does not belong to the named client.' },
          ],
        });
      }

      const client = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { archivedAt: true },
      });
      if (!client) throw appError('NOT_FOUND', { context: { client_id: input.clientId } });
      if (client.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'clientId', reason: 'That client has been archived.' }],
        });
      }

      const project = await tx.project
        .create({
          data: {
            clientId: input.clientId,
            propertyId: input.propertyId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            type: input.type,
            startDate: input.startDate ?? null,
            targetEndDate: input.targetEndDate ?? null,
            createdBy: actorId,
            members: { create: { userId: actorId, roleCode: 'PROJECT_MANAGER' } },
            workstreams: {
              create: WORKSTREAMS_FOR_TYPE[input.type].map((type) => ({
                type,
                name: type === 'PLANNING' ? 'Planning' : 'Supervision',
              })),
            },
          },
        })
        .catch(rethrowDuplicateCode);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Project',
        entityId: project.id,
        projectId: project.id,
        after: {
          code: project.code,
          name: project.name,
          type: project.type,
          status: project.status,
        },
      });

      return project;
    });
  }

  async update(id: string, input: UpdateProject, _actorId: string): Promise<Project> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      // Nothing leaves CLOSED, and nothing inside it changes either.
      if (isProjectReadOnly(before.status as ProjectStatus)) {
        throw appError('ILLEGAL_TRANSITION', {
          context: { project_id: id, status: before.status },
        });
      }

      const { version: _version, ...fields } = input;
      const data: Prisma.ProjectUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          (data as Record<string, unknown>)[key] = value;
        }
      }

      const { count } = await tx.project.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { project_id: id } });

      const after = await tx.project.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Project',
        entityId: id,
        projectId: id,
        before: { code: before.code, name: before.name, type: before.type },
        after: { code: after.code, name: after.name, type: after.type },
      });

      return after;
    });
  }

  /**
   * Moves a project to a new status.
   *
   * This is the only way a status ever changes: there is no field a caller can
   * write. The named action decides the target, the transition table decides
   * whether the move is legal from where the project currently is, and the
   * write is conditional on the project still being in that state — so two
   * people closing the same project at the same time cannot both succeed.
   *
   * A refused transition is recorded. That is precisely the event an audit
   * trail exists for, and because nothing changed it commits in a transaction
   * of its own — inside the failing one, the rollback would take it too.
   */
  async transition(
    id: string,
    action: ProjectAction,
    input: ProjectTransition,
    actorId: string,
  ): Promise<Project> {
    const target: ProjectStatus = PROJECT_ACTIONS[action];

    const current = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw appError('NOT_FOUND');

    const from = current.status as ProjectStatus;
    if (!canTransitionProject(from, target)) {
      await this.recordRefusal(id, from, target, actorId);
      throw appError('ILLEGAL_TRANSITION', {
        fields: [
          {
            field: 'status',
            reason: `A project cannot go from ${humanise(from)} to ${humanise(target)}.`,
          },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.project.updateMany({
        // `status: from` is what makes this safe under concurrency: the second
        // caller finds nothing matching and is refused rather than applying a
        // transition that was legal a moment ago.
        where: { id, status: from, version: input.version },
        data: {
          status: target,
          ...(target === 'COMPLETED' ? { actualEndDate: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { project_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Project',
        entityId: id,
        projectId: id,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.project.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Whether any project references this client or property. Used by archival. */
  async countForClient(clientId: string): Promise<number> {
    return this.prisma.project.count({ where: { clientId } });
  }

  async countForProperty(propertyId: string): Promise<number> {
    return this.prisma.project.count({ where: { propertyId } });
  }

  private async recordRefusal(
    id: string,
    from: ProjectStatus,
    to: ProjectStatus,
    _actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction((tx: Tx) =>
      this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Project',
        entityId: id,
        projectId: id,
        outcome: 'REJECTED',
        before: { status: from },
        after: { status: to },
      }),
    );
  }
}

function humanise(status: ProjectStatus): string {
  return status.toLowerCase().replace('_', ' ');
}

function rethrowDuplicateCode(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'code', reason: 'Another project already uses this code.' }],
    });
  }
  throw error;
}
