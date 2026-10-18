-- A document can be linked to a modification (DOCUMENT_LINKED_TYPES in the
-- shared contracts has said so since modifications were added), but the check
-- on document.linked_type still listed only the original four, so saving one
-- failed with a database error. Widen the closed list to match the contracts.
ALTER TABLE document DROP CONSTRAINT document_linked_type_known;
ALTER TABLE document
  ADD CONSTRAINT document_linked_type_known
  CHECK (
    linked_type IS NULL
    OR linked_type IN ('ACTIVITY', 'SITE_VISIT', 'ISSUE', 'SUBMISSION', 'MODIFICATION')
  );
