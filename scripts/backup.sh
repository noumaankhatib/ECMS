#!/usr/bin/env bash
# Nightly Postgres backup → Cloudflare R2
# Add to crontab: 0 2 * * * /opt/ecms/scripts/backup.sh >> /var/log/ecms-backup.log 2>&1
set -euo pipefail

: "${DB_NAME:?DB_NAME not set}"
: "${DB_SUPER_USER:?DB_SUPER_USER not set}"
: "${DB_SUPER_PASSWORD:?DB_SUPER_PASSWORD not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY not set}"
: "${R2_BUCKET:?R2_BUCKET not set}"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
FILENAME="ecms-backup-${TIMESTAMP}.sql.gz"
TMP_FILE="/tmp/${FILENAME}"

echo "[$(date)] Starting backup: ${FILENAME}"

# Dump and compress
PGPASSWORD="${DB_SUPER_PASSWORD}" pg_dump \
  -h localhost -U "${DB_SUPER_USER}" "${DB_NAME}" \
  | gzip > "${TMP_FILE}"

# Upload to R2 using AWS CLI (s3-compatible endpoint)
AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 cp "${TMP_FILE}" \
  "s3://${R2_BUCKET}/backups/${FILENAME}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto

# Delete local temp file
rm -f "${TMP_FILE}"

# Delete backups older than 30 days from R2
CUTOFF=$(date -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)
echo "[$(date)] Pruning backups older than ${CUTOFF}"

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 ls "s3://${R2_BUCKET}/backups/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto \
| awk '{print $4}' \
| while read -r key; do
    file_date=$(echo "${key}" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
    if [[ -n "${file_date}" && "${file_date}" < "${CUTOFF}" ]]; then
      echo "[$(date)] Deleting old backup: ${key}"
      AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
      AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
      aws s3 rm "s3://${R2_BUCKET}/backups/${key}" \
        --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
        --region auto
    fi
  done

echo "[$(date)] Backup complete: ${FILENAME}"
