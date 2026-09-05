import {
  createDocumentSchema,
  documentListQuerySchema,
  updateDocumentSchema,
  type CreateDocument,
  type DocumentListQuery,
  type Page,
  type UpdateDocument,
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
import type { Document } from '@prisma/client';
import type { Request, Response } from 'express';

import { appError } from '../../shared/errors/app-error';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { RequirePermission } from '../access';

import { DocumentService, type UploadedFile as UploadedFileShape } from './document.service';

/** The signed-in user. The guard guarantees it; this keeps the assertion in one place. */
function actorOf(req: Request): string {
  const user = req.currentUser;
  if (!user) throw appError('UNAUTHENTICATED');
  return user.id;
}

// A generous but bounded ceiling — large engineering files are expected, an
// unbounded body is not (PRD §22's "starts permissive" still means bounded).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
    res.set({
      'Content-Type': document.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
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
