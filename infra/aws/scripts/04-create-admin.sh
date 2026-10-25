#!/usr/bin/env bash
# Creates (or resets) a user. The password is prompted locally and handed over through a short-lived
# SecureString parameter, so it never appears in SSM command history.
# Usage: 04-create-admin.sh <username> "<Display Name>" [ROLE_CODE]   (default role SYSTEM_ADMINISTRATOR)
source "$(dirname "$0")/lib.sh"
require_cli
[[ $# -ge 2 ]] || die 'Usage: 04-create-admin.sh <username> "<Display Name>" [ROLE_CODE]'
user="$1"; display="$2"; role="${3:-SYSTEM_ADMINISTRATOR}"
[[ "$user$display$role" =~ ^[A-Za-z0-9._\ -]+$ ]] || die "Use only letters, digits, space, . _ - in the arguments."

read -r -s -p "Password (min 12 chars): " pw; echo
[[ ${#pw} -ge 12 ]] || die "Password too short."
tmp="/$PROJECT/prod-tmp/admin-password"
aws ssm put-parameter --name "$tmp" --type SecureString --overwrite --value "$pw" >/dev/null
trap 'aws ssm delete-parameter --name "$tmp" >/dev/null 2>&1 || true' EXIT

ssm_run "bash /opt/ecms/current/infra/aws/server/create-user.sh '$user' '$display' '$role'"
echo "User $user ready."
