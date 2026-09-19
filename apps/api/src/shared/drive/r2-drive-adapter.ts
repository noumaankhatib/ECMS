import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { Injectable } from '@nestjs/common';

import type { DriveAdapter } from './drive-adapter';

/**
 * Stores files in Cloudflare R2 (S3-compatible).
 * Key format: {path}/{uuid} — callers pass a path like
 * `{projectId}/drawings/{drawingId}` so files are organised by project in R2.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
@Injectable()
export class R2DriveAdapter implements DriveAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env['R2_ACCOUNT_ID'];
    const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
    this.bucket = process.env['R2_BUCKET'] ?? 'ecms-files';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set when DRIVE_BACKEND=r2');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async upload(fileBuffer: Buffer, path: string): Promise<{ fileId: string }> {
    const fileId = `${path}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileId,
        Body: fileBuffer,
      }),
    );
    return { fileId };
  }

  async download(fileId: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: fileId }),
    );
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async delete(fileId: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: fileId }),
    );
  }
}
