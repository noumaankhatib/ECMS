/**
 * Supervision — site visits, observations and instructions.
 *
 * Owns: SiteVisit, Observation, Instruction.
 * Depends on: access (authorization), audit.
 *
 * The second of Phase 2's three modules (docs/phase-2-plan.md). None of the
 * three carries a status: a site visit is simply a fact once recorded, and
 * PRD §6 gives observations and instructions no lifecycle of their own — a
 * due date and a completion mark, not a transition table.
 */
export { SupervisionModule } from './supervision.module';
export { SiteVisitService } from './site-visit.service';
export { ObservationService } from './observation.service';
export { InstructionService } from './instruction.service';
