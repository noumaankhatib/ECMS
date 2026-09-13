-- Seeds Phase 9's reference data: the required-documents catalogue and the
-- permission matrix for `required_document:admin` (docs/phase-9-plan.md
-- §5-6). Seeded by migration, the same reasoning every prior reference-data
-- seed in this system gives: every environment provably starts with the
-- same rules, and a later change is reviewed as a migration like any other.

-- scope is not a real foreign key, but it is still a closed catalogue,
-- checked the same way every status-shaped column in this system is — a
-- typo here should fail loudly, not sit silently in a requirement nothing
-- ever matches.
ALTER TABLE required_document
  ADD CONSTRAINT required_document_scope_known
  CHECK (scope IN ('PLANNING', 'SUPERVISION', 'ANY'));

-- PRD §16's own six categories, scoped ANY (applies regardless of project
-- type/workstream) — a starting point an administrator can add to, rename
-- or retire afterwards without a code change, the same posture
-- `proposal_sketch_type`'s seed already takes.
INSERT INTO required_document (category, label, scope, sort_order) VALUES
  ('Design',       'Approved architectural, structural and MEP drawings',            'ANY', 1),
  ('Tests',        'Soil, concrete, block, waterproofing and other applicable reports', 'ANY', 2),
  ('Authority',    'Municipality approvals, permits and stage approvals',            'ANY', 3),
  ('Contract',     'Client agreement, contractor documents and related approvals',   'ANY', 4),
  ('Construction', 'Material approvals, inspection records and certificates',        'ANY', 5),
  ('Completion',   'As-built drawings, completion documents, warranties and handover records', 'ANY', 6)
ON CONFLICT (category, scope) DO NOTHING;

-- System Administrator — everything, everywhere.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', 'required_document:admin', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;

-- Document Controller — "document metadata, revisions and controlled
-- records" is exactly this catalogue's own description (docs/phase-3-plan.md
-- §9's reasoning for this role, reused here for the same resource family).
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DOCUMENT_CONTROLLER', 'required_document:admin', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;
