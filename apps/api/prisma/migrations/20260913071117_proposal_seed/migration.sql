-- Seeds the Proposal module's reference data: the sketch-type pick list and
-- the permission matrix for the four `proposal:*` verbs plus `sketch_type:admin`
-- (docs/phase-5-plan.md §4-6). Seeded by migration, the same reasoning the
-- original role/permission seed gives: every environment provably starts with
-- the same rules, and a later change is reviewed as a migration like any other.

-- The real values already in use in the client's own Sketch Register
-- (docs/phase-5-plan.md §3), so the picker is useful on day one. An
-- administrator can add, rename or retire entries afterwards without a code
-- change (§5c) — this is a starting point, not a closed list.
INSERT INTO proposal_sketch_type (code, label, sort_order) VALUES
  ('VILLA_GF_ONLY',     'Villa - GF Only',    1),
  ('VILLA_G_PLUS_1',    'Villa - G+1',        2),
  ('VILLA_G_PLUS_1_PH', 'Villa - G+1+PH',     3),
  ('TWIN_VILLA',        'Twin Villa',         4),
  ('FARM_HOUSE',        'Farm Houses',        5),
  ('EXTENSION',         'Extensions',         6),
  ('INDUSTRIAL',        'Industrial',         7),
  ('RES_COMM',          'Res/Comm',           8),
  ('PLOT_DIVISION',     'Plot Division',      9),
  ('KROOKIE_DIVISION',  'Krookie Division',  10)
ON CONFLICT (code) DO NOTHING;

-- System Administrator — everything, everywhere. Extends the existing row
-- rather than re-declaring it (role_permission has no ON CONFLICT DO UPDATE
-- shape here because each permission is its own row).
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'proposal:view','proposal:create','proposal:edit','proposal:convert','sketch_type:admin'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Director — oversight only, matching its existing posture on every other
-- resource (docs/phase-5-plan.md §6).
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', 'proposal:view', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;

-- Project Manager — full control of proposals, including conversion and
-- managing the sketch-type list, since proposals are pre-project work under
-- their coordination.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'GLOBAL' FROM unnest(ARRAY[
  'proposal:view','proposal:create','proposal:edit','proposal:convert','sketch_type:admin'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Planning — works proposals day to day; conversion and list administration
-- are a manager decision, not theirs.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PLANNING', p, 'GLOBAL' FROM unnest(ARRAY[
  'proposal:view','proposal:create','proposal:edit'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;
