#!/usr/bin/env bash
# Runs once on first boot when the data volume is empty.
# Docker passes POSTGRES_* env vars automatically.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_owner') THEN
      CREATE ROLE ecms_owner LOGIN PASSWORD '$DB_OWNER_PASSWORD';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_app') THEN
      CREATE ROLE ecms_app LOGIN PASSWORD '$DB_APP_PASSWORD';
    END IF;
  END
  \$\$;

  ALTER DATABASE $POSTGRES_DB OWNER TO ecms_owner;

  GRANT CONNECT ON DATABASE $POSTGRES_DB TO ecms_app;
  GRANT USAGE ON SCHEMA public TO ecms_app;
  REVOKE CREATE ON SCHEMA public FROM ecms_app, PUBLIC;

  ALTER SCHEMA public OWNER TO ecms_owner;

  ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecms_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO ecms_app;
EOSQL

echo "==> ecms_owner and ecms_app roles created successfully"
