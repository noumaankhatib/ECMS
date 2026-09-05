-- Phase 3, step 13 — Approvals. Widens submission's status catalogue from
-- {DRAFT, SUBMITTED, WITHDRAWN} to the full shared approval state machine
-- (docs/phase-3-plan.md §4) plus WITHDRAWN, and seeds the one new permission
-- it needs: planning:approve, the first real use of the `approve` verb PRD
-- §8 named back in step 4.

ALTER TABLE submission DROP CONSTRAINT submission_status_known;

ALTER TABLE submission
  ADD CONSTRAINT submission_status_known
  CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
    'RETURNED_FOR_REVISION', 'WITHDRAWN'
  ));

-- Read from PRD §3's own role descriptions: Planning Team's is "planning
-- activities, submissions, drawings AND APPROVALS", Director's is "portfolio
-- visibility, dashboards AND APPROVALS". Self-approval is refused in the
-- application regardless of which of these a person holds — this matrix
-- says who may approve something, not whose (docs/phase-3-plan.md §4, §9).
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', 'planning:approve', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', 'planning:approve', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PLANNING', 'planning:approve', 'PROJECT'
ON CONFLICT (role_code, permission) DO NOTHING;
