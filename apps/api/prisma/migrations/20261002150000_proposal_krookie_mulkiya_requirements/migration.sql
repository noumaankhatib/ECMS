-- Client feedback on the Proposal form: a Krookie survey reference and a
-- "Requirements" field should be mandatory before the proposal can be
-- converted into a project; a Mulkiya title-deed reference stays optional.
-- All 3 are new columns directly on Proposal (not reused from Property),
-- since a proposal may exist with no Property attached yet — enforcement of
-- "mandatory" lives in ProposalService.convert(), not a DB constraint, the
-- same way propertyId itself is already handled on this table.
--
-- Also adds the "Self vs Other" submitter fields from the same feedback.

ALTER TABLE proposal
  ADD COLUMN survey_reference        VARCHAR(100),
  ADD COLUMN title_deed_reference    VARCHAR(100),
  ADD COLUMN requirements            TEXT,
  ADD COLUMN submission_type         VARCHAR(10),
  ADD COLUMN submitted_by            VARCHAR(200),
  ADD COLUMN submitter_relationship  VARCHAR(200),
  ADD CONSTRAINT proposal_submission_type_check
    CHECK (submission_type IN ('SELF', 'OTHER'));
