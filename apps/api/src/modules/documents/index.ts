/**
 * Documents — register, metadata and the Drive seam.
 *
 * Owns: Document.
 * Depends on: access (authorization), audit, the shared DriveAdapter.
 *
 * The third step of Phase 3 (docs/phase-3-plan.md). Deliberately not run
 * through the shared approval state machine — a document's own state is the
 * upload write flow: created PENDING, bytes uploaded, marked ACTIVE or
 * FAILED.
 */
export { DocumentsModule } from './documents.module';
export { DocumentService, type UploadedFile } from './document.service';
