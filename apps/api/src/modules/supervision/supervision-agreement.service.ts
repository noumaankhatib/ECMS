import type {
  CreateSupervisionAgreement,
  Page,
  RenewSupervisionAgreement,
  SupervisionListQuery,
  UpdateSupervisionAgreement,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, SupervisionAgreement } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

export type SupervisionAgreementWithUsage = SupervisionAgreement & { visitsUsed: number };

/**
 * The commercial arrangement a project's site visits happen under
 * (docs/phase-7-plan.md). No lifecycle of its own — a period, a quota, and a
 * renewal fact, the same posture `SiteVisit`/`PlanningActivity` already take
 * for entities PRD gives no state machine.
 */
@Injectable()
export class SupervisionAgreementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `visitsUsed` is always derived from real `SiteVisit` rows, never stored
   * — the same "derive, don't duplicate" choice `Drawing.currentRevisionId`
   * is the one deliberate exception to. A MONTHLY quota resets every month
   * by definition, so its window is the current calendar month intersected
   * with the agreement's own period; an ON_CALL quota covers the whole
   * agreement period.
   */
  private async withUsage(agreement: SupervisionAgreement): Promise<SupervisionAgreementWithUsage> {
    const now = new Date();
    const periodEnd = agreement.endDate && agreement.endDate < now ? agreement.endDate : now;

    let from = agreement.startDate;
    if (agreement.type === 'MONTHLY') {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (monthStart > from) from = monthStart;
    }

    const visitsUsed =
      from > periodEnd
        ? 0
        : await this.prisma.siteVisit.count({
            where: {
              projectId: agreement.projectId,
              visitDate: { gte: from, lte: periodEnd },
            },
          });

    return { ...agreement, visitsUsed };
  }

  async list(
    projectId: string,
    query: SupervisionListQuery,
  ): Promise<Page<SupervisionAgreementWithUsage>> {
    const where: Prisma.SupervisionAgreementWhereInput = { projectId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supervisionAgreement.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supervisionAgreement.count({ where }),
    ]);

    return {
      items: await Promise.all(items.map((item) => this.withUsage(item))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async byId(projectId: string, id: string): Promise<SupervisionAgreementWithUsage> {
    const agreement = await this.prisma.supervisionAgreement.findUnique({ where: { id } });
    if (!agreement || agreement.projectId !== projectId) throw appError('NOT_FOUND');
    return this.withUsage(agreement);
  }

  /**
   * The one active agreement, if any: `startDate <= today`, not yet ended,
   * and not superseded by its own renewal. Lets the project page show the
   * quota without the caller naming an agreement id.
   */
  async current(projectId: string): Promise<SupervisionAgreementWithUsage | null> {
    const now = new Date();
    const agreement = await this.prisma.supervisionAgreement.findFirst({
      where: {
        projectId,
        renewedAt: null,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return agreement ? this.withUsage(agreement) : null;
  }

  async create(
    projectId: string,
    input: CreateSupervisionAgreement,
    actorId: string,
  ): Promise<SupervisionAgreementWithUsage> {
    const agreement = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const created = await tx.supervisionAgreement.create({
        data: {
          projectId,
          type: input.type,
          visitsAllowed: input.visitsAllowed,
          amount: input.amount,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'SupervisionAgreement',
        entityId: created.id,
        projectId,
        after: { type: created.type, visitsAllowed: created.visitsAllowed },
      });

      return created;
    });

    return this.withUsage(agreement);
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateSupervisionAgreement,
    _actorId: string,
  ): Promise<SupervisionAgreementWithUsage> {
    const after = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.supervisionAgreement.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.SupervisionAgreementUpdateManyMutationInput = {
        version: { increment: 1 },
      };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (data as Record<string, unknown>)[key] = value;
      }

      const { count } = await tx.supervisionAgreement.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { agreement_id: id } });

      const updated = await tx.supervisionAgreement.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'SupervisionAgreement',
        entityId: id,
        projectId,
        before: { visitsAllowed: before.visitsAllowed, amount: before.amount.toString() },
        after: { visitsAllowed: updated.visitsAllowed, amount: updated.amount.toString() },
      });

      return updated;
    });

    return this.withUsage(after);
  }

  /**
   * Refuses if the source has already been renewed once — a second renewal
   * attempt should renew the resulting agreement, not layer a second
   * renewal onto the same source. `type`/`visitsAllowed`/`amount` default to
   * the source's own values but are overridable; `startDate` defaults to
   * the day after the source's `endDate` (or today, if it had none).
   */
  async renew(
    projectId: string,
    id: string,
    input: RenewSupervisionAgreement,
    actorId: string,
  ): Promise<SupervisionAgreementWithUsage> {
    const created = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const source = await tx.supervisionAgreement.findUnique({ where: { id } });
      if (!source || source.projectId !== projectId) throw appError('NOT_FOUND');

      if (source.renewedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'renewedAt', reason: 'This agreement has already been renewed.' }],
        });
      }

      const defaultStart = source.endDate
        ? new Date(source.endDate.getTime() + 24 * 60 * 60 * 1000)
        : new Date();

      const { count } = await tx.supervisionAgreement.updateMany({
        where: { id, version: input.version },
        data: { renewedAt: new Date(), version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { agreement_id: id } });

      const renewal = await tx.supervisionAgreement.create({
        data: {
          projectId,
          type: input.type ?? source.type,
          visitsAllowed: input.visitsAllowed ?? source.visitsAllowed,
          amount: input.amount ?? source.amount,
          startDate: input.startDate ?? defaultStart,
          endDate: input.endDate ?? null,
          notes: input.notes ?? null,
          renewedFromId: source.id,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'SupervisionAgreement',
        entityId: source.id,
        projectId,
        after: { renewedAt: true, renewedIntoId: renewal.id },
      });
      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'SupervisionAgreement',
        entityId: renewal.id,
        projectId,
        after: { renewedFromId: source.id },
      });

      return renewal;
    });

    return this.withUsage(created);
  }
}
