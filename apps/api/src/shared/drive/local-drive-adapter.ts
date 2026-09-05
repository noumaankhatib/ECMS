import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import type { DriveAdapter } from './drive-adapter';

/**
 * Writes to a directory on disk and returns a fabricated-but-stable file id
 * — every document route, every permission check, and the whole
 * pending → active transaction shape can be built, exercised and reviewed
 * against this before a real Google Cloud project exists (B7,
 * docs/phase-3-plan.md §7). The id it returns is the relative path within
 * its own root, which is all `download`/`delete` need to find the file
 * again; nothing outside this class ever looks inside it.
 */
@Injectable()
export class LocalDriveAdapter implements DriveAdapter {
  private readonly root = resolve(process.env['LOCAL_DRIVE_DIR'] ?? './.local-drive');

  async upload(fileBuffer: Buffer, path: string): Promise<{ fileId: string }> {
    const fileId = join(path, randomUUID());
    const fullPath = this.resolveWithinRoot(fileId);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, fileBuffer);
    return { fileId };
  }

  async download(fileId: string): Promise<Buffer> {
    return readFile(this.resolveWithinRoot(fileId));
  }

  async delete(fileId: string): Promise<void> {
    await rm(this.resolveWithinRoot(fileId), { force: true });
  }

  /** Defence in depth: a `fileId` this class did not itself generate should
   *  never be able to walk out of its own storage root. */
  private resolveWithinRoot(fileId: string): string {
    const full = resolve(this.root, fileId);
    if (full !== this.root && !full.startsWith(this.root + '/')) {
      throw new Error('Refused: file id resolves outside the local drive root.');
    }
    return full;
  }
}
