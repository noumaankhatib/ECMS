import {
  createDocumentSchema,
  createRequiredDocumentSchema,
  documentListQuerySchema,
  updateDocumentSchema,
  updateRequiredDocumentSchema,
  type CreateDocument,
  type CreateRequiredDocument,
  type DocumentListQuery,
  type Page,
  type UpdateDocument,
  type UpdateRequiredDocument,
} from '@ecms/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Document, RequiredDocument } from '@prisma/client';
import type { Request, Response } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import {
  DocumentService,
  type DocumentCompleteness,
  type UploadedFile as UploadedFileShape,
} from './document.service';
import { RequiredDocumentService } from './required-document.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

// A generous but bounded ceiling — large engineering files are expected, an
// unbounded body is not (PRD §22's "starts permissive" still means bounded).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Types a browser can render on its own — PDFs (every scanned deed, ID
 *  card and survey plan in practice) and images. Everything else (Word,
 *  Excel, ...) has no reliable in-browser viewer, so it still downloads. */
function isInlineViewable(mimeType: string | null): boolean {
  return mimeType === 'application/pdf' || (mimeType?.startsWith('image/') ?? false);
}

@Controller('projects/:projectId/documents')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Get()
  @RequirePermission('document:view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(documentListQuerySchema)) query: DocumentListQuery,
  ): Promise<Page<Document>> {
    return this.documents.list(projectId, query);
  }

  /**
   * Declared before `:id` — Nest matches routes in declaration order, and
   * `completeness` would otherwise be swallowed by the `:id` wildcard and
   * fail `ParseUUIDPipe`, the same ordering rule every other literal-segment
   * route in this system already follows.
   */
  @Get('completeness')
  @RequirePermission('document:view')
  completeness(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<DocumentCompleteness> {
    return this.documents.completeness(projectId);
  }

  @Get(':id')
  @RequirePermission('document:view')
  byId(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Document> {
    return this.documents.byId(projectId, id);
  }

  @Get(':id/content')
  @RequirePermission('document:view')
  async content(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { document, content } = await this.documents.download(projectId, id);
    const filename = document.originalFilename ?? document.id;
    const disposition = isInlineViewable(document.mimeType) ? 'inline' : 'attachment';
    res.set({
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': String(content.length),
    });
    res.send(content);
  }

  @Post()
  @RequirePermission('document:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocument,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Req() req: Request,
  ): Promise<Document> {
    if (!file) {
      throw appError('VALIDATION_FAILED', {
        fields: [{ field: 'file', reason: 'A file is required.' }],
      });
    }
    return this.documents.create(projectId, body, file, actorOf(req));
  }

  @Patch(':id')
  @RequirePermission('document:edit')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: UpdateDocument,
    @Req() req: Request,
  ): Promise<Document> {
    return this.documents.update(projectId, id, body, actorOf(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('document:archive')
  archive(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.documents.archive(projectId, id, actorOf(req));
  }
}

/**
 * The admin-configurable required-documents catalogue (docs/phase-9-plan.md
 * §5) — a global list, not project-scoped, the same shape
 * `ProposalSketchTypeController` already is.
 *
 * There is no `required_document:view` permission — listing is gated by
 * `document:view` because anyone who can see documents already needs to see
 * the checklist to know what's missing; only mutating it needs the
 * dedicated `required_document:admin` permission.
 */
@Controller('required-documents')
export class RequiredDocumentController {
  constructor(private readonly requiredDocuments: RequiredDocumentService) {}

  @Get()
  @RequirePermission('document:view')
  list(): Promise<RequiredDocument[]> {
    return this.requiredDocuments.list();
  }

  @Post()
  @RequirePermission('required_document:admin')
  create(
    @Body(new ZodValidationPipe(createRequiredDocumentSchema)) body: CreateRequiredDocument,
  ): Promise<RequiredDocument> {
    return this.requiredDocuments.create(body);
  }

  @Patch(':id')
  @RequirePermission('required_document:admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRequiredDocumentSchema)) body: UpdateRequiredDocument,
  ): Promise<RequiredDocument> {
    return this.requiredDocuments.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('required_document:admin')
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.requiredDocuments.archive(id);
  }
}
