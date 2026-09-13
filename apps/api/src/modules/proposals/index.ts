/**
 * Proposals — inquiry intake, from first contact to conversion.
 *
 * Owns: Proposal, ProposalSketchType.
 * Depends on: sequence (its own sketch numbers), audit, access.
 *
 * Deliberately independent of Projects: a Proposal predates any Project and
 * is never project-scoped (docs/phase-5-plan.md §6) — the only link between
 * the two modules is the one-way `convertedProjectId` set by the convert
 * action.
 */
export { ProposalsModule } from './proposals.module';
export { ProposalService } from './proposal.service';
export { ProposalSketchTypeService } from './proposal-sketch-type.service';
