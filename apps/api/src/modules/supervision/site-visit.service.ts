import type { CreateSiteVisit, Page, SupervisionListQuery, UpdateSiteVisit } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, SiteVisit } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A structured record of a visit to site (PRD §6, "Supervision Workflow").
 * No lifecycle of its own — a visit either has been made and recorded, or it
 * has not happened yet, and there is nothing for a state machine to check.
 */
@Injectable()
export class SiteVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: SupervisionListQuery): Promise<Page<SiteVisit>> {
    const where: Prisma.SiteVisitWhereInput = {
      projectId,
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: 'insensitive' } },
              { attendees: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.siteVisit.findMany({
        where,
        orderBy: { visitDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.siteVisit.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<SiteVisit> {
    const visit = await this.prisma.siteVisit.findUnique({ where: { id } });
    if (!visit || visit.projectId !== projectId) throw appError('NOT_FOUND');
    return visit;
  }

  async create(projectId: string, input: CreateSiteVisit, actorId: string): Promise<SiteVisit> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const visit = await tx.siteVisit.create({
        data: {
          projectId,
          visitDate: input.visitDate,
          attendees: input.attendees ?? null,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'SiteVisit',
        entityId: visit.id,
        projectId,
        after: { visitDate: visit.visitDate },
      });

      return visit;
    });
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateSiteVisit,
    _actorId: string,
  ): Promise<SiteVisit> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.siteVisit.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.SiteVisitUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.siteVisit.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { site_visit_id: id } });

      const after = await tx.siteVisit.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'SiteVisit',
        entityId: id,
        projectId,
        before: { visitDate: before.visitDate },
        after: { visitDate: after.visitDate },
      });

      return after;
    });
  }
}
