#!/usr/bin/env bash
# Usage: remote-deploy.sh <release> <public-origin> <cookie-secure true|false>
# Runs on the instance (started by 03-deploy.sh through SSM).
set -euo pipefail
RELEASE="$1"; ORIGIN="$2"; SECURE="$3"
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SELF_DIR/common.sh"
RELEASE_DIR="$ECMS_ROOT/releases/$RELEASE"
PREVIOUS="$(readlink -f "$ECMS_ROOT/current" 2>/dev/null || true)"

echo "==> Rendering $ECMS_ROOT/.env from SSM"
param() { aws ssm get-parameter --name "/$PROJECT/prod/$1" --with-decryption --query Parameter.Value --output text; }
umask 077
cat > "$ECMS_ROOT/.env.new" <<ENVEOF
AWS_REGION=$AWS_REGION
PROJECT=$PROJECT
DB_NAME=ecms
DB_APP_USER=ecms_app
DB_OWNER_USER=ecms_owner
DB_SUPER_USER=postgres
DB_SUPER_PASSWORD=$(param DB_SUPER_PASSWORD)
DB_OWNER_PASSWORD=$(param DB_OWNER_PASSWORD)
DB_APP_PASSWORD=$(param DB_APP_PASSWORD)
SESSION_SECRET=$(param SESSION_SECRET)
CORS_ORIGINS=$ORIGIN
COOKIE_SECURE=$SECURE
ENVEOF
mv "$ECMS_ROOT/.env.new" "$ECMS_ROOT/.env"

echo "==> Installing backup timer"
install -m 644 "$SELF_DIR/common.sh" "$ECMS_ROOT/common.sh"
install -m 755 "$SELF_DIR/backup.sh" "$ECMS_ROOT/backup.sh"
install -m 755 "$SELF_DIR/restore.sh" "$ECMS_ROOT/restore.sh"
install -m 644 "$SELF_DIR/ecms-backup.service" /etc/systemd/system/ecms-backup.service
install -m 644 "$SELF_DIR/ecms-backup.timer" /etc/systemd/system/ecms-backup.timer
systemctl daemon-reload
systemctl enable --now ecms-backup.timer

if docker ps --format '{{.Names}}' | grep -q '^ecms-postgres-1$'; then
  echo "==> Pre-deploy backup"
  "$ECMS_ROOT/backup.sh" predeploy || echo "WARNING: pre-deploy backup failed; continuing"
fi

rollback() {
  echo "!! Deploy failed - rolling back"
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$ECMS_ROOT/current"
    RELEASE="$(basename "$PREVIOUS")" RELEASE_DIR="$PREVIOUS" compose up -d --no-build || true
    echo "Rolled back to $(basename "$PREVIOUS"). Note: database migrations are NOT reverted."
  fi
  exit 1
}

echo "==> Building images (release $RELEASE)"
export RELEASE RELEASE_DIR
compose build || rollback

echo "==> Starting database"
compose up -d postgres
for _ in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' ecms-postgres-1 2>/dev/null)" == healthy ]] && break
  sleep 5
done

echo "==> Applying migrations"
compose run --rm --no-deps api sh -c 'MIGRATION_DATABASE_URL="postgresql://$DB_OWNER_USER:$DB_OWNER_PASSWORD@postgres:5432/$DB_NAME" apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma' || rollback

echo "==> Starting application"
compose up -d --wait --wait-timeout 240 || { compose ps; compose logs --tail 40 api web || true; rollback; }

ln -sfn "$RELEASE_DIR" "$ECMS_ROOT/current"

echo "==> Cleaning old releases and images (keeping 3)"
ls -1dt "$ECMS_ROOT"/releases/*/ | tail -n +4 | while read -r old; do
  tag="$(basename "$old")"
  docker rmi "ecms-api:$tag" "ecms-web:$tag" >/dev/null 2>&1 || true
  rm -rf "$old"
done
docker image prune -f >/dev/null
docker builder prune -f --filter until=72h >/dev/null || true

compose ps
echo "==> Deployed $RELEASE ($ORIGIN)"
