-- Client feedback: "I attempted to add same name again — it did allow me to
-- add the same person 2 times." Fixing that at the database level, the same
-- way uq_contact_primary_per_client fixes the analogous primary-contact race.
--
-- Also adds id_number (unique across ALL contacts while live, not just
-- within one client — "The ID# should be unique and system should disallow
-- duplicate contacts to be added"), designation and place_of_work.

ALTER TABLE contact
  ADD COLUMN designation   VARCHAR(150),
  ADD COLUMN place_of_work VARCHAR(200),
  ADD COLUMN id_number     VARCHAR(50);

-- Exact-match dedup within a client. Deliberately a hard block, not the
-- warn-and-override pattern used for client CR/civil ID — the client's
-- complaint here was a literal duplicate row, not a near-match judgement call.
CREATE UNIQUE INDEX uq_contact_name_per_client_live
  ON contact (client_id, lower(name))
  WHERE archived_at IS NULL;

-- Global: the same ID number must not appear on two live contacts anywhere,
-- even across different clients.
CREATE UNIQUE INDEX uq_contact_id_number_live
  ON contact (ecms_normalize_identifier(id_number))
  WHERE id_number IS NOT NULL AND archived_at IS NULL;
