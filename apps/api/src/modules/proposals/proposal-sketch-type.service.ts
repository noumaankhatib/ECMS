import type { CreateProposalSketchType, UpdateProposalSketchType } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { ProposalSketchType } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

/**
 * The admin-configurable sketch-type pick list (docs/phase-5-plan.md §4/§5c).
 *
 * Deliberately small: no pagination, no search — this is a short reference
 * list an administrator maintains by hand, the same shape `Role` already is,
 * not a register of business records.
 */
@Injectable()
export class ProposalSketchTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active entries by default — a retired entry is not offered for a NEW
   *  proposal, but must still resolve for one that already uses it. */
  async list(includeArchived = false): Promise<ProposalSketchType[]> {
    return this.prisma.proposalSketchType.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(input: CreateProposalSketchType): Promise<ProposalSketchType> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.proposalSketchType
        .create({
          data: { code: input.code, label: input.label, sortOrder: input.sortOrder },
        })
        .catch(rethrowDuplicateCode);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'ProposalSketchType',
        entityId: entry.id,
        after: { code: entry.code, label: entry.label },
      });

      return entry;
    });
  }

  async update(id: string, input: UpdateProposalSketchType): Promise<ProposalSketchType> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.proposalSketchType.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      const entry = await tx.proposalSketchType.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'ProposalSketchType',
        entityId: id,
        before: { label: before.label, sortOrder: before.sortOrder },
        after: { label: entry.label, sortOrder: entry.sortOrder },
      });

      return entry;
    });
  }

  /** Retired, never deleted — an existing proposal must keep resolving it. */
  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.proposalSketchType.findUnique({ where: { id } });
      if (!existing) throw appError('NOT_FOUND');
      if (existing.archivedAt) return;

      await tx.proposalSketchType.update({
        where: { id },
        data: { archivedAt: new Date() },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'ProposalSketchType',
        entityId: id,
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}

function rethrowDuplicateCode(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'code', reason: 'Another sketch type already uses this code.' }],
    });
  }
  throw error;
}
