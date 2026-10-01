-- ---------------------------------------------------------------------------
-- Permission: workflow:override_gate
-- ---------------------------------------------------------------------------

-- Completing a project or workstream while its completion conditions are
-- unmet is a judgement about the work as a whole, so it is held globally,
-- and only by the two roles accountable for it — the same pair that may
-- override a duplicate identity match. Every use carries a written reason.
INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'workflow:override_gate', 'GLOBAL'
FROM unnest(ARRAY['SYSTEM_ADMINISTRATOR', 'DIRECTOR']) AS r
ON CONFLICT (role_code, permission) DO NOTHING;
