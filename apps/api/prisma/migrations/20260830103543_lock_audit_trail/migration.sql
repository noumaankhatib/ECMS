-- Make the audit trail append-only at the database level.
--
-- PRD §10: "Audit history must not be editable by ordinary users."
--
-- Application code enforcing this would be a promise. Revoking the privilege
-- makes it a guarantee: even a bug, a careless script, or someone connected
-- with the application's own credentials cannot alter or erase history.
--
-- Only ecms_owner (migrations) retains full rights, and it is never used by the
-- running application.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_entry" FROM ecms_app;
GRANT SELECT, INSERT ON TABLE "audit_entry" TO ecms_app;

-- Future tables still default to full DML for the app; the audit table is the
-- deliberate exception. Re-state it here so a database rebuilt from migrations
-- alone ends up in the same state.
ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecms_app;
