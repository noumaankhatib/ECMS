#!/usr/bin/env bash
# Deploys or updates ECMS on a server whose PostgreSQL runs on the host
# (see scripts/install-postgres.sh). Run from the repo root after filling .env.
#
#   ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod-hostdb.yml --env-file .env"

[ -f .env ] || { echo "Missing .env — copy .env.production.example and fill it in." >&2; exit 1; }

echo "==> Applying database migrations"
# Migrations run from the host, so the database host is localhost, not the
# host.docker.internal name the api container uses.
DB_HOST=localhost pnpm install --frozen-lockfile
DB_HOST=localhost pnpm db:deploy

echo "==> Building and starting the stack"
$COMPOSE up -d --build

echo "==> Status"
$COMPOSE ps
