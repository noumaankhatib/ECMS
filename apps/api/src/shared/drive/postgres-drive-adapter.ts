import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import type { DriveAdapter } from './drive-adapter';

/**
 * Stores file bytes as a row in Postgres instead of a separate file store.
 *
 * An initial-stage choice, not a target architecture: every backup and every
 * ordinary query against `document`/`drawing_revision` now shares I/O with
 * whatever this table holds, and there is no plan to bound how large it
 * grows. It exists for the one environment where that trade-off is worth
 * making — a free-tier deploy that has a database provisioned and nothing
 * else — so the product can be exercised end-to-end before a real object
 * store (S3, R2, Google Drive) is set up. Swapping it out later is a
 * `DriveModule` provider change, nothing more; `DocumentService` and
 * `DrawingRevisionService` only ever depend on `DriveAdapter`.
 *
 * `fileId` is the `DriveFile` row's own id — an opaque UUID, the same shape
 * every other adapter already hands back.
 */
@Injectable()
export class PostgresDriveAdapter implements DriveAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async upload(fileBuffer: Buffer): Promise<{ fileId: string }> {
    const row = await this.prisma.driveFile.create({
      data: { content: Uint8Array.from(fileBuffer) },
      select: { id: true },
    });
    return { fileId: row.id };
  }

  async download(fileId: string): Promise<Buffer> {
    const row = await this.prisma.driveFile.findUniqueOrThrow({
      where: { id: fileId },
      select: { content: true },
    });
    return Buffer.from(row.content);
  }

  async delete(fileId: string): Promise<void> {
    await this.prisma.driveFile.deleteMany({ where: { id: fileId } });
  }
}
