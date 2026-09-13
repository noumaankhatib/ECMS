/**
 * Documents — register, metadata and the Drive seam.
 *
 * Owns: Document, RequiredDocument.
 * Depends on: access (authorization), audit, the shared DriveAdapter.
 *
 * The third step of Phase 3 (docs/phase-3-plan.md). Deliberately not run
 * through the shared approval state machine — a document's own state is the
 * upload write flow: created PENDING, bytes uploaded, marked ACTIVE or
 * FAILED.
 *
 * `RequiredDocument` and `DocumentService.completeness` are Phase 9
 * (docs/phase-9-plan.md) — a global, admin-configured checklist diffed
 * against this project's own `Document.category` rows at read time.
 */
export { DocumentsModule } from './documents.module';
export {
  DocumentService,
  type DocumentCompleteness,
  type DocumentCompletenessItem,
  type UploadedFile,
} from './document.service';
export { RequiredDocumentService } from './required-document.service';
