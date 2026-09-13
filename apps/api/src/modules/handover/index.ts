/**
 * Handover — the Closure-phase checklist that gates a project's own
 * `COMPLETED → CLOSED` transition (docs/phase-10-plan.md).
 *
 * Owns: HandoverChecklist.
 * Depends on: access (authorization), audit.
 *
 * Phase 10 of the roadmap, and the last workflow phase — Phase 11 only
 * reads what everything before it has recorded. Exports `HandoverService`
 * so `ProjectService.transition()` can consult `isReady()` before allowing
 * `close`.
 */
export { HandoverModule } from './handover.module';
export { HandoverService } from './handover.service';
