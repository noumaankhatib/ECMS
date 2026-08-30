import type { CreateClient, ListQuery, Page, UpdateClient } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Client, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery): Promise<Page<Client>> {
    const where: Prisma.ClientWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Count and page in one round trip rather than two sequential ones.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw appError('NOT_FOUND');
    return client;
  }

  async create(input: CreateClient, actorId: string): Promise<Client> {
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client
        .create({
          data: {
            name: input.name,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateReference);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Client',
        entityId: client.id,
        after: { name: client.name, reference: client.reference },
      });

      return client;
    });
  }

  /**
   * Applies an edit, but only if nobody else has changed the record since the
   * caller read it.
   *
   * The version is part of the WHERE clause, so a stale write matches zero rows
   * and is refused. Checking first and then writing would leave a gap between
   * the two in which another request could land.
   */
  async update(id: string, input: UpdateClient, _actorId: string): Promise<Client> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      const { count } = await tx.client.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          version: { increment: 1 },
        },
      });

      if (count === 0) throw appError('STALE_RECORD', { context: { client_id: id } });

      const after = await tx.client.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Client',
        entityId: id,
        before: { name: before.name, reference: before.reference, notes: before.notes },
        after: { name: after.name, reference: after.reference, notes: after.notes },
      });

      return after;
    });
  }

  /**
   * Archives a client.
   *
   * PRD §6 forbids destructive deletion where dependent history exists, so this
   * never deletes. It also refuses while live properties remain attached —
   * archiving the parent would otherwise strand them, visible but belonging to
   * nothing.
   */
  async archive(id: string, actorId: string): Promise<void> {
    // The dependency check runs first, and on its own.
    //
    // A refusal must be RECORDED, and a refusal changes nothing — so it cannot
    // be audited inside the transaction it is about to abort. Rolling that
    // transaction back would take the audit row with it, and the refusal would
    // leave no trace at all.
    //
    // The two cases are genuinely different:
    //   a change      → audit belongs in the same transaction, so neither can
    //                   exist without the other
    //   a refusal     → nothing changed, so the audit row stands alone and
    //                   commits by itself
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw appError('NOT_FOUND');
    if (client.archivedAt) return; // Already archived; nothing to do.

    const liveProperties = await this.prisma.property.count({
      where: { clientId: id, archivedAt: null },
    });

    // Projects count whatever their status, including closed ones. A project is
    // the record of an engagement, and PRD §6 does not let the customer it was
    // for quietly disappear from underneath it.
    //
    // The consequence is deliberate and worth stating: a client the consultancy
    // has ever worked for cannot be archived. That is the letter of the plan's
    // definition of done, and it is the safe direction to be wrong in — but it
    // is a question to put back to the client, because tidying away a customer
    // from ten years ago is a reasonable thing to want.
    const projects = await this.prisma.project.count({ where: { clientId: id } });

    if (liveProperties > 0 || projects > 0) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'ARCHIVED',
          entityType: 'Client',
          entityId: id,
          outcome: 'REJECTED',
        }),
      );

      throw appError('DEPENDENCY_EXISTS', {
        fields: [
          ...(liveProperties > 0
            ? [
                {
                  field: 'properties',
                  reason: `${String(liveProperties)} active ${liveProperties === 1 ? 'property is' : 'properties are'} still attached to this client.`,
                },
              ]
            : []),
          ...(projects > 0
            ? [
                {
                  field: 'projects',
                  reason: `${String(projects)} ${projects === 1 ? 'project belongs' : 'projects belong'} to this client.`,
                },
              ]
            : []),
        ],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();

      // Re-checked inside the transaction and conditional on the row still
      // being live, so two simultaneous archive requests cannot both proceed.
      const { count } = await tx.client.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt, archivedBy: actorId, version: { increment: 1 } },
      });
      if (count === 0) return;

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Client',
        entityId: id,
        before: { archivedAt: null },
        after: { archivedAt: archivedAt.toISOString() },
      });
    });
  }
}

/**
 * Turns the database's uniqueness refusal into a message about the field the
 * user actually filled in.
 */
function rethrowDuplicateReference(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'reference', reason: 'Another client already uses this reference.' }],
    });
  }
  throw error;
}
