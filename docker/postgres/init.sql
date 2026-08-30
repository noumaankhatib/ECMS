-- Runs once, as superuser, when the data volume is empty.
--
-- Establishes the two-account privilege model that PRD §10 and §14 require:
--
--   ecms_owner  owns the schema. Runs migrations. Never used by the application.
--   ecms_app    what the running application connects as. Can read and write
--               business data, but cannot alter the schema — and, once the audit
--               table exists, cannot UPDATE or DELETE audit history.
--
-- Splitting these is what turns "audit history must not be editable" from a
-- promise in the code into a guarantee the database enforces.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_owner') THEN
    CREATE ROLE ecms_owner LOGIN PASSWORD 'ecms_local_password';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_app') THEN
    CREATE ROLE ecms_app LOGIN PASSWORD 'ecms_local_password';
  END IF;
END
$$;

ALTER DATABASE ecms OWNER TO ecms_owner;

-- CREATEDB is needed only for local development: `prisma migrate dev` builds a
-- throwaway shadow database to verify a migration before applying it.
-- Deployed environments run `prisma migrate deploy`, which needs no shadow
-- database, so ecms_owner does NOT get this privilege outside local.
ALTER ROLE ecms_owner CREATEDB;

-- The application may use the schema but never modify its shape.
GRANT CONNECT ON DATABASE ecms TO ecms_app;
GRANT USAGE ON SCHEMA public TO ecms_app;
REVOKE CREATE ON SCHEMA public FROM ecms_app, PUBLIC;

ALTER SCHEMA public OWNER TO ecms_owner;

-- Default privileges for tables ecms_owner creates from here on. Per-table
-- exceptions (notably the audit table) are applied in migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ecms_app;
