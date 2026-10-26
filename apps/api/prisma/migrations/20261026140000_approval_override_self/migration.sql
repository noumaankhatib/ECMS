-- ---------------------------------------------------------------------------
-- Permission: approval:override_self
-- ---------------------------------------------------------------------------

-- Nobody may approve a drawing revision, submission or modification they
-- created themselves. The two roles accountable for the portfolio as a whole
-- may do so anyway, but only by writing down why; the reason is kept in the
-- audit trail beside the approval. Held globally, never per project, and by
-- the same pair that may override a completion gate or a duplicate identity.
INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'approval:override_self', 'GLOBAL'
FROM unnest(ARRAY['SYSTEM_ADMINISTRATOR', 'DIRECTOR']) AS r
ON CONFLICT (role_code, permission) DO NOTHING;
