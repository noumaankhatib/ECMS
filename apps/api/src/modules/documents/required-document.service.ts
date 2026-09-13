import type { CreateRequiredDocument, UpdateRequiredDocument } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { RequiredDocument } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * The admin-configurable required-documents catalogue (docs/phase-9-plan.md
 * §5). Deliberately small: no pagination, no search — the same shape
 * `ProposalSketchType` already is, not a register of business records.
 */
@Injectable()
export class RequiredDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active entries by default — a retired requirement is not offered for a
   *  NEW completeness check, but a project already missing it must not have
   *  that count silently vanish. */
  async list(includeArchived = false): Promise<RequiredDocument[]> {
    return this.prisma.requiredDocument.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(input: CreateRequiredDocument): Promise<RequiredDocument> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.requiredDocument
        .create({
          data: {
            category: input.category,
            label: input.label,
            scope: input.scope,
            sortOrder: input.sortOrder,
          },
        })
        .catch(rethrowDuplicateCategory);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'RequiredDocument',
        entityId: entry.id,
        after: { category: entry.category, scope: entry.scope },
      });

      return entry;
    });
  }

  async update(id: string, input: UpdateRequiredDocument): Promise<RequiredDocument> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.requiredDocument.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      const entry = await tx.requiredDocument.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'RequiredDocument',
        entityId: id,
        before: { label: before.label, scope: before.scope },
        after: { label: entry.label, scope: entry.scope },
      });

      return entry;
    });
  }

  /** Retired, never deleted — a project's completeness history must keep
   *  meaning what it meant at the time. */
  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.requiredDocument.findUnique({ where: { id } });
      if (!existing) throw appError('NOT_FOUND');
      if (existing.archivedAt) return;

      await tx.requiredDocument.update({ where: { id }, data: { archivedAt: new Date() } });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'RequiredDocument',
        entityId: id,
        before: { archivedAt: null },
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}

function rethrowDuplicateCategory(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [
        {
          field: 'category',
          reason: 'A requirement for this category and scope already exists.',
        },
      ],
    });
  }
  throw error;
}
