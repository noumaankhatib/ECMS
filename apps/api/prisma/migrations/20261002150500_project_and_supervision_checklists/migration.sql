-- Client feedback on the New Project and "Add supervision" forms: a simple
-- document-received checklist, captured at creation time (or filled in later
-- when upgrading a planning project to supervision, if not collected earlier
-- at the proposal stage). Plain booleans, not uploads — this is unrelated to
-- the existing RequiredDocument/completeness system, which tracks uploaded
-- files on the Documents tab after a project already exists.
--
-- Also adds an Assigned Site Engineer field to Workstream, following the
-- same non-FK pattern as PlanningActivity.assignee_id.

ALTER TABLE project
  ADD COLUMN mulkiya_received   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN id_card_received   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN agreement_received BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE workstream
  ADD COLUMN krookie_received           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN approved_drawings_received BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN site_engineer_id           UUID;
