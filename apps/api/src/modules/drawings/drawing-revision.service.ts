import {
  DRAWING_REVISION_ACTIONS,
  canTransitionApproval,
  type ApprovalStatus,
  type CreateDrawingRevision,
  type DrawingRevisionAction,
  type DrawingRevisionTransition,
  type Page,
  type DrawingListQuery as RevisionListQuery,
} from '@ecms/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { DrawingRevision, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { DRIVE_ADAPTER, type DriveAdapter } from '../../shared/drive/drive-adapter';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/** What the controller hands the service — plain fields, not a framework
 *  type, the same shape `DocumentService` takes (duplicated rather than
 *  imported: a module may only reach into another module's `index`, and
 *  this shape is not part of `DocumentsModule`'s public surface). */
export interface UploadedFile {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
}

/**
 * Append-only. A new revision is a new row, never an update to an existing
 * one — the strictest invariant in the system (docs/phase-3-plan.md §5).
 * Status is the shared approval state machine (`ApprovalStatus`), consumed
 * unchanged from `@ecms/contracts` — no submission-style extra edge.
 */
@Injectable()
export class DrawingRevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(DRIVE_ADAPTER) private readonly drive: DriveAdapter,
  ) {}

  async list(
    projectId: string,
    drawingId: string,
    query: RevisionListQuery,
  ): Promise<Page<DrawingRevision>> {
    await this.requireDrawing(this.prisma, projectId, drawingId);

    const where: Prisma.DrawingRevisionWhereInput = { drawingId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.drawingRevision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.drawingRevision.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, drawingId: string, id: string): Promise<DrawingRevision> {
    await this.requireDrawing(this.prisma, projectId, drawingId);

    const revision = await this.prisma.drawingRevision.findUnique({ where: { id } });
    if (!revision || revision.drawingId !== drawingId) throw appError('NOT_FOUND');
    return revision;
  }

  /**
   * Creates the next revision. If one is already current, it is superseded
   * in the same transaction — three writes, the same shape
   * `Project.transition` uses for a conditional status move: supersede the
   * old current row, create the new one, point the drawing at it.
   *
   * `file` is optional — a revision may still be registered with no bytes
   * yet, the same as before this had real upload support. When given, the
   * bytes are written to Drive AFTER this transaction commits (external I/O
   * has no place inside one) and the row is then marked ACTIVE or FAILED,
   * the exact three-step write flow `DocumentService.create` uses.
   */
  async create(
    projectId: string,
    drawingId: string,
    input: CreateDrawingRevision,
    actorId: string,
    file?: UploadedFile,
  ): Promise<DrawingRevision> {
    const revision = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);
      const drawing = await this.requireDrawing(tx, projectId, drawingId);

      // The old current row must be superseded BEFORE the new one is
      // inserted. Both briefly holding supersededAt = NULL for the same
      // drawing — even for an instant, within one transaction — is exactly
      // what uq_drawing_revision_current exists to refuse, and the index is
      // not deferrable.
      if (drawing.currentRevisionId) {
        await tx.drawingRevision.update({
          where: { id: drawing.currentRevisionId },
          data: { supersededAt: new Date() },
        });
      }

      const created = await tx.drawingRevision
        .create({
          data: {
            drawingId,
            revisionCode: input.revisionCode,
            notes: input.notes ?? null,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateCode);

      await tx.drawing.update({
        where: { id: drawingId },
        data: { currentRevisionId: created.id, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'DrawingRevision',
        entityId: created.id,
        projectId,
        after: { drawingId, revisionCode: created.revisionCode },
      });

      return created;
    });

    if (!file) return revision;

    try {
      const { fileId } = await this.drive.upload(file.buffer, `${projectId}/drawings/${drawingId}`);

      return await this.prisma.$transaction(async (tx) => {
        const active = await tx.drawingRevision.update({
          where: { id: revision.id },
          data: {
            uploadStatus: 'ACTIVE',
            fileId,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            version: { increment: 1 },
          },
        });

        await this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'DrawingRevision',
          entityId: revision.id,
          projectId,
          before: { uploadStatus: 'PENDING' },
          after: { uploadStatus: 'ACTIVE' },
        });

        return active;
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.drawingRevision.update({
          where: { id: revision.id },
          data: { uploadStatus: 'FAILED', version: { increment: 1 } },
        });

        await this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'DrawingRevision',
          entityId: revision.id,
          projectId,
          outcome: 'REJECTED',
          before: { uploadStatus: 'PENDING' },
          after: { uploadStatus: 'FAILED' },
        });
      });

      throw appError('INTERNAL', {
        context: { drawing_revision_id: revision.id, error: String(error) },
      });
    }
  }

  /** The same shape `DocumentService.download` uses — the revision must have
   *  an ACTIVE upload before there is anything to hand back. */
  async download(
    projectId: string,
    drawingId: string,
    id: string,
  ): Promise<{ revision: DrawingRevision; content: Buffer }> {
    const revision = await this.byId(projectId, drawingId, id);
    if (revision.uploadStatus !== 'ACTIVE' || !revision.fileId) {
      throw appError('CONFLICT', {
        fields: [{ field: 'id', reason: 'This revision has no uploaded file to download.' }],
      });
    }

    const content = await this.drive.download(revision.fileId);
    return { revision, content };
  }

  /**
   * Moves a revision to a new status. The named action decides the target,
   * `canTransitionApproval` decides whether the move is legal from where the
   * revision currently is, and the write is conditional on it still being in
   * that state — the same three-layer shape every other state machine in
   * this system uses. Once a revision reaches `APPROVED`, the database
   * trigger takes over: even a bug here could not un-approve it.
   */
  async transition(
    projectId: string,
    drawingId: string,
    id: string,
    action: DrawingRevisionAction,
    input: DrawingRevisionTransition,
  ): Promise<DrawingRevision> {
    await this.requireDrawing(this.prisma, projectId, drawingId);

    const target: ApprovalStatus = DRAWING_REVISION_ACTIONS[action];

    const current = await this.prisma.drawingRevision.findUnique({
      where: { id },
      select: { id: true, drawingId: true, status: true },
    });
    if (!current || current.drawingId !== drawingId) throw appError('NOT_FOUND');

    const from = current.status as ApprovalStatus;
    if (!canTransitionApproval(from, target)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'DrawingRevision',
          entityId: id,
          projectId,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: target },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [
          { field: 'status', reason: `A drawing revision cannot go from ${from} to ${target}.` },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const { count } = await tx.drawingRevision.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { drawing_revision_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'DrawingRevision',
        entityId: id,
        projectId,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.drawingRevision.findUniqueOrThrow({ where: { id } });
    });
  }

  /** The drawing named in the URL must belong to the project also named in
   *  it — the same two-level check supervision's observations/instructions
   *  already need. */
  private async requireDrawing(
    tx: Prisma.TransactionClient,
    projectId: string,
    drawingId: string,
  ): Promise<{ id: string; currentRevisionId: string | null }> {
    const drawing = await tx.drawing.findUnique({
      where: { id: drawingId },
      select: { id: true, projectId: true, currentRevisionId: true },
    });
    if (!drawing || drawing.projectId !== projectId) throw appError('NOT_FOUND');
    return drawing;
  }
}

function rethrowDuplicateCode(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [
        { field: 'revisionCode', reason: 'This drawing already has a revision with that code.' },
      ],
    });
  }
  throw error;
}
