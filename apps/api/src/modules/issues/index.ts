/**
 * Issues — the fourth state machine in the system.
 *
 * Owns: Issue.
 * Depends on: access (authorization), audit.
 *
 * The third of Phase 2's three modules (docs/phase-2-plan.md). An issue is
 * optionally raised from an Observation, and moves Open → In Progress →
 * Resolved → Closed, with reopening recorded — the last of the four state
 * machines named in phase-1-plan.md §5a.
 */
export { IssuesModule } from './issues.module';
export { IssueService } from './issue.service';
