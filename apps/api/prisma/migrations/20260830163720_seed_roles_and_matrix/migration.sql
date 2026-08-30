-- The seven roles (PRD §3) and the starting role-to-permission matrix.
--
-- Seeded by migration rather than by an application seeder so that every
-- environment — local, staging, production — provably holds the same rules,
-- and a change to them is reviewed as a migration like any other schema change.
--
-- The client has confirmed the shape below but not yet the fine detail
-- (open question B2). When they do, that is an INSERT/DELETE here — no
-- application logic changes. That is why this lives in a table.
--
--   GLOBAL  = anywhere in the portfolio
--   PROJECT = only within projects the person is a member of

INSERT INTO "role" (code, name, description, sort_order) VALUES
  ('SYSTEM_ADMINISTRATOR', 'System Administrator', 'Users, roles, permissions and system configuration.', 1),
  ('DIRECTOR',             'Management / Director', 'Portfolio visibility, dashboards and approvals.', 2),
  ('PROJECT_MANAGER',      'Project Manager', 'Project setup, coordination, assignments and progress.', 3),
  ('PLANNING',             'Planning Team', 'Planning activities, submissions, drawings and approvals.', 4),
  ('SUPERVISION',          'Supervision Team', 'Site visits, observations, instructions and issue closure.', 5),
  ('DOCUMENT_CONTROLLER',  'Document Controller', 'Document metadata, revisions and controlled records.', 6),
  ('CLIENT_STAKEHOLDER',   'Client / External Stakeholder', 'Restricted access to approved information when enabled.', 7)
ON CONFLICT (code) DO NOTHING;

-- System Administrator — everything, everywhere.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'client:view','client:create','client:edit','client:archive',
  'property:view','property:create','property:edit','property:archive',
  'project:view','project:create','project:edit','project:close','project:manage_members',
  'user:view','user:admin','role:view','role:admin'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Director — sees the whole portfolio, does not do day-to-day editing.
-- Deliberately holds no edit or archive rights: oversight, not data entry.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'client:view','property:view','project:view','user:view','role:view'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Project Manager — full control of their OWN projects, and the ability to set
-- new work up. Note the mixed scope: they may read any client and create a
-- project, but may only edit, close or staff the projects they belong to.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'GLOBAL' FROM unnest(ARRAY[
  'client:view','client:create','property:view','property:create','project:create','user:view'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'PROJECT' FROM unnest(ARRAY[
  'project:view','project:edit','project:close','project:manage_members'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Planning, Supervision and Document Control — in Phase 1 they can look up
-- reference data and see the projects they are on. Their real work arrives in
-- phases 2 and 3; starting narrow is deliberate, because loosening a permission
-- later is easy and tightening one after six months is an argument.
INSERT INTO role_permission (role_code, permission, scope)
SELECT r, p, 'GLOBAL'
FROM unnest(ARRAY['PLANNING','SUPERVISION','DOCUMENT_CONTROLLER']) AS r
CROSS JOIN unnest(ARRAY['client:view','property:view']) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'project:view', 'PROJECT'
FROM unnest(ARRAY['PLANNING','SUPERVISION','DOCUMENT_CONTROLLER']) AS r
ON CONFLICT (role_code, permission) DO NOTHING;

-- CLIENT_STAKEHOLDER is seeded with NO permissions. External access is out of
-- scope for now; the role exists so the boundary is designed for, and granting
-- it today gives access to nothing.
