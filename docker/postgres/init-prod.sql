-- Production init — runs once when the data volume is empty.
-- Passwords come from environment variables injected by docker-compose.prod.yml.
-- See docker/postgres/init.sql for the full privilege model rationale.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_owner') THEN
    EXECUTE format('CREATE ROLE ecms_owner LOGIN PASSWORD %L', current_setting('ecms.owner_password'));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_app') THEN
    EXECUTE format('CREATE ROLE ecms_app LOGIN PASSWORD %L', current_setting('ecms.app_password'));
  END IF;
END
$$;

ALTER DATABASE ecms OWNER TO ecms_owner;

GRANT CONNECT ON DATABASE ecms TO ecms_app;
GRANT USAGE ON SCHEMA public TO ecms_app;
REVOKE CREATE ON SCHEMA public FROM ecms_app, PUBLIC;

ALTER SCHEMA public OWNER TO ecms_owner;

ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ecms_app;
