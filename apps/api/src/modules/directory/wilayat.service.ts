import type { CreateWilayat, UpdateWilayat, WilayatWithVillages } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Wilayat } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * The wilayats offered on the property form — a short reference list an
 * administrator maintains, like the sketch types. `Property.wilayat` stays
 * free text, so retiring or renaming an entry never changes a property.
 */
@Injectable()
export class WilayatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active wilayats, each with the villages already recorded under it. */
  async list(): Promise<WilayatWithVillages[]> {
    const [wilayats, places] = await Promise.all([
      this.prisma.wilayat.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.property.groupBy({
        by: ['wilayat', 'village'],
        where: { archivedAt: null, wilayat: { not: null }, village: { not: null } },
      }),
    ]);

    const villagesOf = new Map<string, Set<string>>();
    for (const place of places) {
      if (!place.wilayat || !place.village) continue;
      const key = place.wilayat.trim().toLowerCase();
      const set = villagesOf.get(key) ?? new Set<string>();
      set.add(place.village.trim());
      villagesOf.set(key, set);
    }

    return wilayats.map((w) => ({
      id: w.id,
      name: w.name,
      sortOrder: w.sortOrder,
      villages: [...(villagesOf.get(w.name.trim().toLowerCase()) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    }));
  }

  async create(input: CreateWilayat): Promise<Wilayat> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.wilayat.findUnique({ where: { name: input.name } });
      if (existing && !existing.archivedAt) throw duplicate();

      // A retired entry with the same name is brought back rather than refused.
      const entry = existing
        ? await tx.wilayat.update({
            where: { id: existing.id },
            data: { archivedAt: null, sortOrder: input.sortOrder },
          })
        : await tx.wilayat.create({ data: { name: input.name, sortOrder: input.sortOrder } });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Wilayat',
        entityId: entry.id,
        after: { name: entry.name },
      });
      return entry;
    });
  }

  async update(id: string, input: UpdateWilayat): Promise<Wilayat> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.wilayat.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      const entry = await tx.wilayat
        .update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        })
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === 'P2002') throw duplicate();
          throw error;
        });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Wilayat',
        entityId: id,
        before: { name: before.name, sortOrder: before.sortOrder },
        after: { name: entry.name, sortOrder: entry.sortOrder },
      });
      return entry;
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.wilayat.findUnique({ where: { id } });
      if (!existing) throw appError('NOT_FOUND');
      if (existing.archivedAt) return;

      await tx.wilayat.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Wilayat',
        entityId: id,
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}

function duplicate(): never {
  throw appError('CONFLICT', {
    fields: [{ field: 'name', reason: 'That wilayat is already on the list.' }],
  });
}
