import type { CreateProperty, ListQuery, Page, UpdateProperty } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Property } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, clientId?: string): Promise<Page<Property>> {
    const where: Prisma.PropertyWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { postcode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.property.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(id: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw appError('NOT_FOUND');
    return property;
  }

  async create(input: CreateProperty, actorId: string): Promise<Property> {
    return this.prisma.$transaction(async (tx) => {
      // A property must belong to a live client. Attaching one to an archived
      // client would create a record nobody can reach.
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { id: true, archivedAt: true },
      });
      if (!client) throw appError('NOT_FOUND', { context: { client_id: input.clientId } });
      if (client.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'clientId', reason: 'That client has been archived.' }],
        });
      }

      const property = await tx.property
        .create({
          data: {
            clientId: input.clientId,
            name: input.name,
            reference: input.reference ?? null,
            addressLine1: input.addressLine1 ?? null,
            addressLine2: input.addressLine2 ?? null,
            city: input.city ?? null,
            postcode: input.postcode ?? null,
            country: input.country ?? null,
            notes: input.notes ?? null,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateReference);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Property',
        entityId: property.id,
        after: { name: property.name, clientId: property.clientId },
      });

      return property;
    });
  }

  async update(id: string, input: UpdateProperty, _actorId: string): Promise<Property> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.property.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      const { version: _version, ...fields } = input;
      const data: Prisma.PropertyUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          (data as Record<string, unknown>)[key] = value;
        }
      }

      const { count } = await tx.property.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { property_id: id } });

      const after = await tx.property.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Property',
        entityId: id,
        before: { name: before.name, reference: before.reference, city: before.city },
        after: { name: after.name, reference: after.reference, city: after.city },
      });

      return after;
    });
  }

  /**
   * Archives a property.
   *
   * Refuses while any project sits on it, for the same reason a client with
   * properties is refused: the project would be left pointing at a site that no
   * longer appears anywhere.
   *
   * The refusal is audited in a transaction of its own. Nothing changed, so
   * there is nothing for it to be atomic with — and inside the failing
   * transaction the rollback would erase the record of the refusal.
   */
  async archive(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, archivedAt: true },
    });
    if (!existing) throw appError('NOT_FOUND');

    if (!existing.archivedAt) {
      const projects = await this.prisma.project.count({ where: { propertyId: id } });
      if (projects > 0) {
        await this.prisma.$transaction((tx) =>
          this.audit.record(tx, {
            action: 'ARCHIVED',
            entityType: 'Property',
            entityId: id,
            outcome: 'REJECTED',
          }),
        );

        throw appError('DEPENDENCY_EXISTS', {
          fields: [
            {
              field: 'projects',
              reason: `${String(projects)} ${projects === 1 ? 'project is' : 'projects are'} attached to this property.`,
            },
          ],
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id } });
      if (!property) throw appError('NOT_FOUND');
      if (property.archivedAt) return;

      await tx.property.update({
        where: { id },
        data: { archivedAt: new Date(), archivedBy: actorId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Property',
        entityId: id,
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}

function rethrowDuplicateReference(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'reference', reason: 'Another property already uses this reference.' }],
    });
  }
  throw error;
}
