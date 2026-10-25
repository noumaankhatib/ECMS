#!/usr/bin/env bash
# Usage: create-user.sh <username> <displayName> <roleCode>   - password is read from a temporary SSM parameter.
set -euo pipefail
source "$(dirname "$0")/common.sh"
pw="$(aws ssm get-parameter --name "/$PROJECT/prod-tmp/admin-password" --with-decryption --query Parameter.Value --output text)"
compose exec -T api node apps/api/dist/tools/create-user.js "$1" "$2" "$pw" "$3"
