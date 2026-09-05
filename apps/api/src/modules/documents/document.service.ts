import type { CreateDocument, DocumentListQuery, Page, UpdateDocument } from '@ecms/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Document, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { DRIVE_ADAPTER, type DriveAdapter } from '../../shared/drive/drive-adapter';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';

import { requireOpenProject } from './project-guard';

/** What the controller hands the service — plain fields, not a framework
 *  type, so this class has no dependency on how the bytes arrived. */
export interface UploadedFile {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
}

/**
 * A registered document (PRD §6). Deliberately not run through
 * `ApprovalStatus` (docs/phase-3-plan.md §4) — its own state is the write
 * flow architecture-discussion §6.5 (decision A5) specifies: created
 * PENDING, bytes uploaded, marked ACTIVE with the file id, or FAILED if the
 * upload never completed.
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(DRIVE_ADAPTER) private readonly drive: DriveAdapter,
  ) {}

  async list(projectId: string, query: DocumentListQuery): Promise<Page<Document>> {
    const where: Prisma.DocumentWhereInput = {
      projectId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.linkedType ? { linkedType: query.linkedType } : {}),
      ...(query.linkedId ? { linkedId: query.linkedId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { category: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(projectId: string, id: string): Promise<Document> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.projectId !== projectId) throw appError('NOT_FOUND');
    return document;
  }

  /**
   * The write flow architecture-discussion §6.5 specifies, as three separate
   * steps rather than one transaction: the PENDING row is created and
   * committed first, the bytes are then uploaded outside any open
   * transaction (external I/O has no place inside one), and the outcome —
   * ACTIVE with the file id, or FAILED — is written last. A crash between
   * steps leaves a PENDING row rather than losing the record that an upload
   * was ever attempted.
   */
  async create(
    projectId: string,
    input: CreateDocument,
    file: UploadedFile,
    actorId: string,
  ): Promise<Document> {
    const document = await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      if (input.linkedType && input.linkedId) {
        await this.requireLinkedRecordInProject(tx, projectId, input.linkedType, input.linkedId);
      }

      const created = await tx.document.create({
        data: {
          projectId,
          category: input.category,
          title: input.title,
          description: input.description ?? null,
          linkedType: input.linkedType ?? null,
          linkedId: input.linkedId ?? null,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Document',
        entityId: created.id,
        projectId,
        after: { category: created.category, title: created.title },
      });

      return created;
    });

    try {
      const { fileId } = await this.drive.upload(file.buffer, projectId);

      return await this.prisma.$transaction(async (tx) => {
        const active = await tx.document.update({
          where: { id: document.id },
          data: { uploadStatus: 'ACTIVE', fileId, version: { increment: 1 } },
        });

        await this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Document',
          entityId: document.id,
          projectId,
          before: { uploadStatus: 'PENDING' },
          after: { uploadStatus: 'ACTIVE' },
        });

        return active;
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: document.id },
          data: { uploadStatus: 'FAILED', version: { increment: 1 } },
        });

        await this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Document',
          entityId: document.id,
          projectId,
          outcome: 'REJECTED',
          before: { uploadStatus: 'PENDING' },
          after: { uploadStatus: 'FAILED' },
        });
      });

      throw appError('INTERNAL', { context: { document_id: document.id, error: String(error) } });
    }
  }

  /**
   * Metadata only — there is no re-upload. A new file is a new document, the
   * same way a new drawing revision is a new row rather than an edit to the
   * old one.
   */
  async update(
    projectId: string,
    id: string,
    input: UpdateDocument,
    _actorId: string,
  ): Promise<Document> {
    return this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const before = await tx.document.findUnique({ where: { id } });
      if (!before || before.projectId !== projectId) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      const { count } = await tx.document.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { document_id: id } });

      const after = await tx.document.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Document',
        entityId: id,
        projectId,
        before: { category: before.category, title: before.title },
        after: { category: after.category, title: after.title },
      });

      return after;
    });
  }

  /** Archived, never deleted — the underlying file is left in place, only
   *  the register entry is hidden from ordinary listings. */
  async archive(projectId: string, id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await requireOpenProject(tx, projectId);

      const document = await tx.document.findUnique({ where: { id } });
      if (!document || document.projectId !== projectId) throw appError('NOT_FOUND');
      if (document.archivedAt) return;

      await tx.document.update({
        where: { id },
        data: { archivedAt: new Date(), archivedBy: actorId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Document',
        entityId: id,
        projectId,
      });
    });
  }

  async download(projectId: string, id: string): Promise<{ document: Document; content: Buffer }> {
    const document = await this.byId(projectId, id);
    if (document.uploadStatus !== 'ACTIVE' || !document.fileId) {
      throw appError('CONFLICT', {
        fields: [{ field: 'id', reason: 'This document has no uploaded file to download.' }],
      });
    }

    const content = await this.drive.download(document.fileId);
    return { document, content };
  }

  /**
   * A document can point at a record in any of four different tables — not
   * a real foreign key (docs/phase-3-plan.md §6). Each of the four target
   * tables carries `projectId` directly, so this is a flat lookup, unlike
   * `IssueService`'s two-hop check through an observation's site visit.
   */
  private async requireLinkedRecordInProject(
    tx: Prisma.TransactionClient,
    projectId: string,
    linkedType: NonNullable<CreateDocument['linkedType']>,
    linkedId: string,
  ): Promise<void> {
    const record = await (() => {
      switch (linkedType) {
        case 'ACTIVITY':
          return tx.planningActivity.findUnique({
            where: { id: linkedId },
            select: { projectId: true },
          });
        case 'SITE_VISIT':
          return tx.siteVisit.findUnique({
            where: { id: linkedId },
            select: { projectId: true },
          });
        case 'ISSUE':
          return tx.issue.findUnique({ where: { id: linkedId }, select: { projectId: true } });
        case 'SUBMISSION':
          return tx.submission.findUnique({
            where: { id: linkedId },
            select: { projectId: true },
          });
      }
    })();

    if (!record) throw appError('NOT_FOUND', { context: { linked_id: linkedId } });
    if (record.projectId !== projectId) {
      throw appError('CONFLICT', {
        fields: [{ field: 'linkedId', reason: 'That record does not belong to this project.' }],
      });
    }
  }
}
