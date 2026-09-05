/**
 * Drawings — the strictest invariant in the system.
 *
 * Owns: Drawing, DrawingRevision.
 * Depends on: access (authorization), audit.
 *
 * The second step of Phase 3 (docs/phase-3-plan.md). A revision is
 * append-only and, once approved, immutable even against direct database
 * access — enforced by a trigger, not only application code. Status is the
 * shared approval state machine `ApprovalStatus` (introduced in step 13 for
 * submissions), consumed here unchanged.
 */
export { DrawingsModule } from './drawings.module';
export { DrawingService } from './drawing.service';
export { DrawingRevisionService } from './drawing-revision.service';
