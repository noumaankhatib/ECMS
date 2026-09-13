/**
 * Modifications — client-requested mid-construction changes (docs/phase-8-plan.md).
 *
 * Owns: Modification.
 * Depends on: access (authorization), audit.
 *
 * Phase 8 of the roadmap. Optionally links to a `DrawingRevision` (Phase 3)
 * or an `Observation` (Phase 2) — neither required. Status is the shared
 * approval state machine `ApprovalStatus`, consumed unchanged, the same
 * treatment `DrawingRevision` already gets. No new permission resource:
 * rides the existing `planning:*` verbs.
 */
export { ModificationsModule } from './modifications.module';
export { ModificationService } from './modification.service';
