#!/usr/bin/env bash
# Generates the app secrets once and stores them as SSM SecureStrings. Existing values are never overwritten
# (changing a DB password here would not change it inside Postgres).
source "$(dirname "$0")/lib.sh"
require_cli

for name in DB_SUPER_PASSWORD DB_OWNER_PASSWORD DB_APP_PASSWORD SESSION_SECRET; do
  path="/$PROJECT/prod/$name"
  if aws ssm get-parameter --name "$path" >/dev/null 2>&1; then
    echo "exists   $path"
  else
    aws ssm put-parameter --name "$path" --type SecureString --value "$(openssl rand -hex 24)" >/dev/null
    echo "created  $path"
  fi
done
echo "Secrets live only in SSM Parameter Store; nothing was printed or written to disk."
