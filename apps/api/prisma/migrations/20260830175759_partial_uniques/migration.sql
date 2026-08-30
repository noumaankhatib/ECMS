-- Uniqueness that applies to LIVE records only.
--
-- A plain unique index would be wrong here. Archiving a client called
-- "Riverside Developments" must not stop a new client of the same name being
-- created later, and re-using a reference from a closed engagement is normal.
-- These indexes therefore ignore archived rows.
--
-- This is the counterpart to soft delete: without it, archival silently
-- reserves names and references forever.

CREATE UNIQUE INDEX uq_client_reference_live
  ON "client" (lower(reference))
  WHERE reference IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX uq_property_reference_live
  ON property (lower(reference))
  WHERE reference IS NOT NULL AND archived_at IS NULL;

-- At most one primary contact per client. Enforced here rather than in
-- application code, because two requests arriving together would both pass an
-- application check and both write.
CREATE UNIQUE INDEX uq_contact_primary_per_client
  ON contact (client_id)
  WHERE is_primary = true AND archived_at IS NULL;

-- Supports case-insensitive name search without a sequential scan.
CREATE INDEX idx_client_name_lower ON "client" (lower(name));
CREATE INDEX idx_property_name_lower ON property (lower(name));
