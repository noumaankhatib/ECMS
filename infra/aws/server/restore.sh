#!/usr/bin/env bash
# Usage: restore.sh latest | <s3-key-under-backups/postgres/>   (e.g. ecms-20260101T020000Z-scheduled.dump)
# Takes a safety backup first, stops api/web, restores over the live database, restarts.
set -euo pipefail
source /opt/ecms/common.sh 2>/dev/null || source "$(dirname "$0")/common.sh"
target="${1:?usage: restore.sh latest|<dump file name>}"
set -a; source "$ECMS_ROOT/.env"; set +a

if [[ "$target" == latest ]]; then
  target="$(aws s3 ls "s3://$BACKUP_BUCKET/backups/postgres/" | awk '{print $4}' | sort | tail -n 1)"
  [[ -n "$target" ]] || { echo "No backups found."; exit 1; }
fi
echo "Restoring $target"
"$ECMS_ROOT/backup.sh" before-restore
aws s3 cp "s3://$BACKUP_BUCKET/backups/postgres/$target" "/var/backups/ecms/restore.dump" --only-show-errors

compose stop web api
docker exec -i -e PGPASSWORD="$DB_SUPER_PASSWORD" ecms-postgres-1 \
  pg_restore -U "$DB_SUPER_USER" -d "$DB_NAME" --clean --if-exists --no-owner --role=ecms_owner < /var/backups/ecms/restore.dump
rm -f /var/backups/ecms/restore.dump
compose start api web
echo "Restore complete."
