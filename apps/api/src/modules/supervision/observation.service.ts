import type {
  CreateObservation,
  Page,
  SupervisionListQuery,
  UpdateObservation,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Observation, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject, requireSiteVisit } from './project-guard';

/**
 * Something seen on a site visit (PRD §6). No lifecycle — an Issue is what an
 * observation becomes when it needs owning to a resolution, and that is a
 * separate, later step, not something this record does itself.
 */
@Injectable()
export class ObservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    siteVisitId: string,
    query: SupervisionListQuery,
  ): Promise<Page<Observation>> {
    await requireSiteVisit(this.prisma, projectId, siteVisitId);

    const where: Prisma.ObservationWhereInput = {
      siteVisitId,
      ...(query.search ? { description: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.observation.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.observation.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, siteVisitId: string, id: string): Promise<Observation> {
    await requireSiteVisit(this.prisma, projectId, siteVisitId);

    const observation = await this.prisma.observation.findUnique({ where: { id } });
    if (!observation || observation.siteVisitId !== siteVisitId) throw appError('NOT_FOUND');
    return observation;
  }

  async create(
    projectId: string,
    siteVisitId: string,
    input: CreateObservation,
    actorId: string,
  ): Promise<Observation> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await requireSiteVisit(tx, projectId, siteVisitId);

      const observation = await tx.observation.create({
        data: {
          siteVisitId,
          description: input.description,
          category: input.category ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Observation',
        entityId: observation.id,
        projectId,
        after: { description: observation.description },
      });

      return observation;
    });
  }

  async update(
    projectId: string,
    siteVisitId: string,
    id: string,
    input: UpdateObservation,
    _actorId: string,
  ): Promise<Observation> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      await requireSiteVisit(tx, projectId, siteVisitId);

      const before = await tx.observation.findUnique({ where: { id } });
      if (!before || before.siteVisitId !== siteVisitId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.ObservationUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.observation.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { observation_id: id } });

      const after = await tx.observation.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Observation',
        entityId: id,
        projectId,
        before: { description: before.description },
        after: { description: after.description },
      });

      return after;
    });
  }
}
