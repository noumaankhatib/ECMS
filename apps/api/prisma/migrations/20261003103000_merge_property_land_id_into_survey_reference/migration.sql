-- Correction: `land_id` (added in 20261002141000) duplicated an existing
-- field. The "Land ID" the client circled on the Krookie (top-left serial,
-- e.g. "01-05-014-01-132") is the same number `survey_reference` already
-- captured as "the Krookie's own serial" (added long before this round of
-- feedback). Having two columns for one real-world number invited the two
-- to disagree. This migration folds land_id back into survey_reference and
-- promotes survey_reference from the soft warn-and-override duplicate system
-- to a hard unique constraint, matching what the client actually asked for
-- ("this is a unique number so wont be duplicated").

-- ---------------------------------------------------------------------------
-- Backfill: prefer an existing survey_reference; fall back to land_id only
-- where survey_reference was never set.
-- ---------------------------------------------------------------------------

UPDATE property
SET survey_reference = land_id
WHERE survey_reference IS NULL AND land_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Drop the old column and both indexes that referenced it/the soft index on
-- survey_reference — replaced below by one hard-unique index.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS uq_property_land_id_live;
DROP INDEX IF EXISTS idx_property_survey_reference_live;

ALTER TABLE property DROP COLUMN land_id;

-- ---------------------------------------------------------------------------
-- survey_reference is now hard-unique among live properties, same pattern
-- as Client.reference / Property.reference.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX uq_property_survey_reference_live
  ON property (ecms_normalize_identifier(survey_reference))
  WHERE survey_reference IS NOT NULL AND archived_at IS NULL;
