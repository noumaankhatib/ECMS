#!/usr/bin/env bash
# Usage: backup.sh [label]   - custom-format pg_dump to S3 (instance role, SSE), then a CloudWatch heartbeat.
# Files are stored in Postgres (DRIVE_BACKEND=postgres), so this one dump covers documents too.
set -euo pipefail
source /opt/ecms/common.sh 2>/dev/null || source "$(dirname "$0")/common.sh"
label="${1:-scheduled}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
file="/var/backups/ecms/ecms-$ts-$label.dump"
mkdir -p /var/backups/ecms

# shellcheck disable=SC1091
set -a; source "$ECMS_ROOT/.env"; set +a
docker exec -e PGPASSWORD="$DB_SUPER_PASSWORD" ecms-postgres-1 \
  pg_dump -U "$DB_SUPER_USER" -d "$DB_NAME" -Fc > "$file.partial"
mv "$file.partial" "$file"
[[ -s "$file" ]] || { echo "empty dump"; exit 1; }

aws s3 cp "$file" "s3://$BACKUP_BUCKET/backups/postgres/$(basename "$file")" --sse AES256 --only-show-errors
ls -1t /var/backups/ecms/*.dump 2>/dev/null | tail -n +3 | xargs -r rm -f
aws cloudwatch put-metric-data --namespace ECMS --metric-name BackupSucceeded --value 1 --unit Count
echo "Backup ok: s3://$BACKUP_BUCKET/backups/postgres/$(basename "$file")"
