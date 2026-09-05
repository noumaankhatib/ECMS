/**
 * The seam architecture-discussion §6.5 (decision A5) and
 * docs/phase-3-plan.md §7 specify: this database stores business metadata,
 * something behind this interface stores the actual bytes. `LocalDriveAdapter`
 * is the only implementation until B7 (the Google Drive authentication
 * model) is answered — nothing above this interface, including
 * `DocumentService` and every route built on it, changes when a real
 * `GoogleDriveAdapter` arrives.
 */
export interface DriveAdapter {
  upload(fileBuffer: Buffer, path: string): Promise<{ fileId: string }>;
  download(fileId: string): Promise<Buffer>;
  delete(fileId: string): Promise<void>;
}

/** Injection token — `DocumentService` depends on this, not on a concrete
 *  class, so swapping the implementation is a provider change, not a rewrite. */
export const DRIVE_ADAPTER = Symbol('DRIVE_ADAPTER');
