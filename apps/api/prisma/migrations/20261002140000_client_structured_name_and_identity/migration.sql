-- Client name becomes 4 structured parts instead of one free-text field, per
-- client feedback ("The name of the client should be 4 names: Name, Father
-- Name, Grandfather Name, Surname"). A company client keeps using
-- `first_name` alone (see `formatClientName` in @ecms/contracts) — the other
-- 3 parts are for individuals.
--
-- Also adds `mobile_number`, requested alongside the name change, following
-- the same stored+normalised pattern as contact.phone.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

ALTER TABLE "client"
  ADD COLUMN first_name              VARCHAR(100),
  ADD COLUMN father_name             VARCHAR(100),
  ADD COLUMN grandfather_name        VARCHAR(100),
  ADD COLUMN surname                 VARCHAR(100),
  ADD COLUMN mobile_number           VARCHAR(50),
  ADD COLUMN mobile_number_normalized VARCHAR(20);

-- ---------------------------------------------------------------------------
-- Backfill — existing single `name` becomes `first_name`. The other 3 parts
-- are left blank; nothing in the old data distinguishes them.
-- ---------------------------------------------------------------------------

UPDATE "client" SET first_name = name WHERE first_name IS NULL;

ALTER TABLE "client" ALTER COLUMN first_name SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Drop the old column and the indexes that depended on it
-- (dropping the column would cascade-drop these automatically, but they are
-- dropped explicitly here so the replacement indexes below are easy to compare
-- against what they replace).
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS client_name_idx;
DROP INDEX IF EXISTS idx_client_name_lower;
DROP INDEX IF EXISTS idx_client_name_trgm_live;

ALTER TABLE "client" DROP COLUMN name;

-- ---------------------------------------------------------------------------
-- Replacement indexes, same shape as the ones dropped above, over the
-- concatenated full name so search/duplicate-detection keep working the same
-- way they did against the single `name` column.
--
-- `concat_ws` itself is STABLE, not IMMUTABLE (Postgres has to assume any
-- "anynonarray" argument might not format deterministically), so it cannot be
-- used in an index expression. This wraps the same "join the given parts,
-- skipping blanks" behaviour — the same behaviour `formatClientName` and
-- `array_to_string`'s 2-argument form both give — in a function Postgres can
-- verify is IMMUTABLE.
-- ---------------------------------------------------------------------------

CREATE FUNCTION ecms_client_full_name(
  first_name text, father_name text, grandfather_name text, surname text
) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT array_to_string(ARRAY[first_name, father_name, grandfather_name, surname], ' ')
$$;

CREATE INDEX client_first_name_idx ON "client" (first_name);

CREATE INDEX idx_client_full_name_lower
  ON "client" (lower(ecms_client_full_name(first_name, father_name, grandfather_name, surname)));

CREATE INDEX idx_client_name_trgm_live
  ON "client" USING gin (ecms_normalize_name(ecms_client_full_name(first_name, father_name, grandfather_name, surname)) gin_trgm_ops)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- mobile_number normalisation backfill — mirrors contact.phone_normalized.
-- ---------------------------------------------------------------------------

UPDATE "client"
SET mobile_number_normalized = CASE
  WHEN length(d) = 8 THEN '+968' || d
  WHEN length(d) > 8 THEN '+' || d
END
FROM (
  SELECT id AS cid,
         regexp_replace(regexp_replace(mobile_number, '\D+', '', 'g'), '^00', '') AS d
  FROM "client"
  WHERE mobile_number IS NOT NULL
) AS cleaned
WHERE "client".id = cleaned.cid;

CREATE INDEX idx_client_mobile_number_normalized_live
  ON "client" (mobile_number_normalized)
  WHERE mobile_number_normalized IS NOT NULL AND archived_at IS NULL;
