import type { CreateDrawing, DrawingListQuery, Page } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Drawing, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/**
 * A registered drawing — stable identity only (PRD §6). No update: a
 * drawing's number and title are set once, and everything that actually
 * changes over the drawing's life belongs to its revisions
 * (docs/phase-3-plan.md §5).
 */
@Injectable()
export class DrawingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: DrawingListQuery): Promise<Page<Drawing>> {
    const where: Prisma.DrawingWhereInput = {
      projectId,
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.drawing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.drawing.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Drawing> {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } });
    if (!drawing || drawing.projectId !== projectId) throw appError('NOT_FOUND');
    return drawing;
  }

  async create(projectId: string, input: CreateDrawing, actorId: string): Promise<Drawing> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const drawing = await tx.drawing
        .create({
          data: {
            projectId,
            number: input.number,
            title: input.title,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateNumber);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Drawing',
        entityId: drawing.id,
        projectId,
        after: { number: drawing.number, title: drawing.title },
      });

      return drawing;
    });
  }
}

function rethrowDuplicateNumber(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [
        { field: 'number', reason: 'Another drawing on this project already uses this number.' },
      ],
    });
  }
  throw error;
}
