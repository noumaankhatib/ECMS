-- Duplicate detection for clients and properties.
--
-- Nothing here is a UNIQUE constraint, deliberately. The rule agreed with the
-- client is "warn, and let a person with the authority decide": the same CR
-- number on two live clients is refused by the API unless the caller holds
-- `directory:override_duplicate` and gives a reason. A database constraint
-- would make that override impossible — and would fail this migration on any
-- environment where duplicates already exist.

-- Fuzzy name comparison. pg_trgm is a TRUSTED extension (PostgreSQL 13+), so
-- the database owner may install it without a superuser; ecms_owner owns the
-- database in both init.sql and init-prod.sh.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

ALTER TABLE "client"
  ADD COLUMN client_type VARCHAR(20),
  ADD COLUMN cr_number   VARCHAR(50),
  ADD COLUMN civil_id    VARCHAR(50),
  ADD CONSTRAINT client_client_type_check CHECK (client_type IN ('COMPANY', 'INDIVIDUAL'));

ALTER TABLE contact ADD COLUMN phone_normalized VARCHAR(20);

-- ---------------------------------------------------------------------------
-- Normalisation, defined once so the indexes and the queries cannot disagree
-- ---------------------------------------------------------------------------

-- A name reduced to what identifies it: lower case, no punctuation or spaces,
-- and without the legal-form and filler words that vary between one person's
-- spelling of a company and another's. "Al-Balushi Trading L.L.C." and
-- "al balushi trading" both become "albalushi".
--
-- If stripping those words leaves nothing ("Trading Co"), the name is kept
-- whole rather than reduced to an empty string that would match every other
-- such name.
CREATE FUNCTION ecms_normalize_name(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(replace(input, '.', '')), '[^[:alnum:]]+', ' ', 'g'),
          '\m(llc|spc|saoc|saog|co|company|est|establishment|trading|the|and)\M', ' ', 'g'),
        '\s+', '', 'g'),
      ''),
    regexp_replace(lower(input), '[^[:alnum:]]+', '', 'g'))
$$;

-- Mirrors `normalizeIdentifier` in @ecms/contracts. Used for the Krookie
-- serial, whose dashes are formatting, not content.
CREATE FUNCTION ecms_normalize_identifier(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT upper(regexp_replace(input, '[\s\-/.]+', '', 'g')) $$;

-- A plot number keeps its slash: "102/8" and "10/28" are different plots.
CREATE FUNCTION ecms_normalize_plot(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT upper(regexp_replace(input, '\s+', '', 'g')) $$;

-- "As Seeb", "As-Seeb" and "as seeb" are one wilayat.
CREATE FUNCTION ecms_normalize_place(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT regexp_replace(lower(input), '[^[:alnum:]]+', '', 'g') $$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Mirrors `normalizePhone`: digits only, a leading 00 dropped, an eight-digit
-- local number given 968, anything shorter than eight digits left null.
-- `phone` itself is not touched.
UPDATE contact
SET phone_normalized = CASE
  WHEN length(d) = 8 THEN '+968' || d
  WHEN length(d) > 8 THEN '+' || d
END
FROM (
  SELECT id AS cid,
         regexp_replace(regexp_replace(phone, '\D+', '', 'g'), '^00', '') AS d
  FROM contact
  WHERE phone IS NOT NULL
) AS cleaned
WHERE contact.id = cleaned.cid;

-- ---------------------------------------------------------------------------
-- Indexes — live rows only, the same reasoning as 20260830175759_partial_uniques
-- ---------------------------------------------------------------------------

CREATE INDEX idx_client_name_trgm_live
  ON "client" USING gin (ecms_normalize_name(name) gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX idx_client_cr_number_live
  ON "client" (cr_number)
  WHERE cr_number IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_client_civil_id_live
  ON "client" (civil_id)
  WHERE civil_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_contact_phone_normalized_live
  ON contact (phone_normalized)
  WHERE phone_normalized IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_property_plot_live
  ON property (ecms_normalize_plot(plot_number), ecms_normalize_place(wilayat))
  WHERE plot_number IS NOT NULL AND wilayat IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_property_survey_reference_live
  ON property (ecms_normalize_identifier(survey_reference))
  WHERE survey_reference IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_property_name_trgm_live
  ON property USING gin (ecms_normalize_name(name) gin_trgm_ops)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

-- Overriding an identity match is a judgement about the register as a whole,
-- so it is held globally, and only by the two roles accountable for it.
INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'directory:override_duplicate', 'GLOBAL'
FROM unnest(ARRAY['SYSTEM_ADMINISTRATOR', 'DIRECTOR']) AS r
ON CONFLICT (role_code, permission) DO NOTHING;
