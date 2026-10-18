#!/usr/bin/env bash
# Runs the browser tests (pnpm run e2e) against a throwaway PostgreSQL in Docker,
# so they never touch your real data and need nothing running beforehand.
#
#   pnpm run e2e:local
#
# What it does: starts a disposable Postgres (same image and privilege setup as
# the app's own database), applies the migrations, creates the administrator the
# suite signs in as, runs the suite, then removes the container whatever the
# outcome. Needs Docker, and ports 3000, 3001 and 55432 free.
set -euo pipefail

cd "$(dirname "$0")/.."

NAME=ecms-e2e-pg
PORT=55432
PASSWORD=ecms_local_password

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "==> Starting a throwaway database"
docker build -q -t ecms-e2e-postgres docker/postgres >/dev/null
docker run -d --name "$NAME" \
  -e POSTGRES_DB=ecms -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -p "127.0.0.1:${PORT}:5432" ecms-e2e-postgres >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d ecms >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres -d ecms >/dev/null

export DB_HOST=localhost DB_PORT="$PORT" DB_NAME=ecms
export DB_APP_USER=ecms_app DB_APP_PASSWORD="$PASSWORD"
export DB_OWNER_USER=ecms_owner DB_OWNER_PASSWORD="$PASSWORD"
export DATABASE_URL="postgresql://ecms_app:${PASSWORD}@localhost:${PORT}/ecms"
export MIGRATION_DATABASE_URL="postgresql://ecms_owner:${PASSWORD}@localhost:${PORT}/ecms"
export API_URL=http://localhost:3001
export E2E_ADMIN_EMAIL=ci-admin@ecms.local
export E2E_ADMIN_PASSWORD=a-perfectly-fine-ci-password
# Only used when the API itself needs one; harmless otherwise.
export SESSION_SECRET="${SESSION_SECRET:-e2e-secret-e2e-secret-e2e-secret-1234}"

echo "==> Migrating and creating the administrator"
pnpm --filter @ecms/api exec prisma migrate deploy --schema=prisma/schema.prisma >/dev/null
pnpm --filter @ecms/api run build >/dev/null
node apps/api/dist/tools/create-user.js "$E2E_ADMIN_EMAIL" "CI Administrator" "$E2E_ADMIN_PASSWORD" SYSTEM_ADMINISTRATOR

# A saved session from an earlier run points at a different database.
rm -rf apps/web/tests/e2e/.auth

echo "==> Running the browser tests"
node scripts/e2e.mjs
