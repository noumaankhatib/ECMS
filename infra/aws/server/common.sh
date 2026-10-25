#!/usr/bin/env bash
# Sourced by the server-side scripts. Runs on the instance as root.
set -euo pipefail
# shellcheck disable=SC1091
source /opt/ecms/instance.env
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
ECMS_ROOT=/opt/ecms
COMPOSE_FILE_REL=infra/aws/docker-compose.aws.yml

compose() {
  local dir="${RELEASE_DIR:-$ECMS_ROOT/current}"
  RELEASE="${RELEASE:-$(basename "$(readlink -f "$ECMS_ROOT/current")")}" \
    docker compose -p ecms --env-file "$ECMS_ROOT/.env" -f "$dir/$COMPOSE_FILE_REL" "$@"
}
