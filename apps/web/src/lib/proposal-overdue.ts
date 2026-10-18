/** Statuses where a due date no longer matters: the inquiry ended, became a
 *  project, or was put on hold on purpose (a paused proposal is not late). */
const FINISHED = new Set(['CONVERTED', 'LOST', 'ON_HOLD']);

/**
 * Whether a proposal is past its due date and still open. A proposal that was
 * converted or lost is never overdue, whatever its date says, and one with no
 * due date can't be.
 */
export function isProposalOverdue(
  proposal: { dueAt: string | null; status: string },
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!proposal.dueAt || FINISHED.has(proposal.status)) return false;
  return proposal.dueAt.slice(0, 10) < today;
}
