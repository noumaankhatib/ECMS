-- docs/phase-6-plan.md §4 — HALTED and CANCELLED are two more
-- submission-specific edges on top of the shared approval state machine,
-- the same discipline the Phase 3 approvals migration already applied when
-- it added WITHDRAWN.

ALTER TABLE submission DROP CONSTRAINT submission_status_known;

ALTER TABLE submission
  ADD CONSTRAINT submission_status_known
  CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
    'RETURNED_FOR_REVISION', 'WITHDRAWN', 'HALTED', 'CANCELLED'
  ));
