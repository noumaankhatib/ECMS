#!/usr/bin/env bash
# Installs PostgreSQL 16 from the official PGDG apt repo (Debian/Ubuntu) and
# creates the ECMS database and the two-account model from
# docker/postgres/init-prod.sh: ecms_owner (migrations) and ecms_app (runtime).
#
# Usage (as root):
#   DB_OWNER_PASSWORD=... DB_APP_PASSWORD=... sudo -E ./scripts/install-postgres.sh
# Optional: DB_NAME (default ecms), PG_VERSION (default 16),
#           DOCKER_SUBNET (default 172.16.0.0/12) — lets containers reach the host DB.
set -euo pipefail

: "${DB_OWNER_PASSWORD:?Set DB_OWNER_PASSWORD}"
: "${DB_APP_PASSWORD:?Set DB_APP_PASSWORD}"
DB_NAME="${DB_NAME:-ecms}"
PG_VERSION="${PG_VERSION:-16}"
DOCKER_SUBNET="${DOCKER_SUBNET:-172.16.0.0/12}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo -E)." >&2; exit 1; }

echo "==> Installing PostgreSQL ${PG_VERSION}"
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  >/etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y "postgresql-${PG_VERSION}"

CONF_DIR="/etc/postgresql/${PG_VERSION}/main"

echo "==> Configuring access"
# Listen on localhost and the Docker bridge so the api container can connect.
sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" "${CONF_DIR}/postgresql.conf"
if ! grep -q "ecms-managed" "${CONF_DIR}/pg_hba.conf"; then
  cat >>"${CONF_DIR}/pg_hba.conf" <<EOF
# ecms-managed
host ${DB_NAME} ecms_owner 127.0.0.1/32 scram-sha-256
host ${DB_NAME} ecms_app   127.0.0.1/32 scram-sha-256
host ${DB_NAME} ecms_owner ${DOCKER_SUBNET} scram-sha-256
host ${DB_NAME} ecms_app   ${DOCKER_SUBNET} scram-sha-256
EOF
fi
systemctl restart postgresql
systemctl enable postgresql

echo "==> Creating database and roles"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb "${DB_NAME}"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" \
  -v owner_pw="${DB_OWNER_PASSWORD}" -v app_pw="${DB_APP_PASSWORD}" -v db="${DB_NAME}" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT format('CREATE ROLE ecms_owner LOGIN PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_owner') \gexec
SELECT format('CREATE ROLE ecms_app LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecms_app') \gexec

SELECT format('ALTER DATABASE %I OWNER TO ecms_owner', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO ecms_app', :'db') \gexec

GRANT USAGE ON SCHEMA public TO ecms_app;
REVOKE CREATE ON SCHEMA public FROM ecms_app, PUBLIC;
ALTER SCHEMA public OWNER TO ecms_owner;

ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecms_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ecms_app;
EOSQL

cat <<EOF

==> Done. PostgreSQL ${PG_VERSION} is running with database '${DB_NAME}'.
Block port 5432 from the internet (e.g. 'ufw deny 5432') — only localhost and
Docker need it.

Next:
  - In .env set DB_HOST=host.docker.internal (api container) and DB_HOST=localhost
    for the host-side migration URLs.
  - Run migrations:  pnpm db:deploy
EOF
