#!/usr/bin/env bash
# Shared helpers, sourced by the other scripts. Runs on your laptop.
set -euo pipefail

AWS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$AWS_DIR/../.." && pwd)"

[[ -f "$AWS_DIR/config.env" ]] || { echo "Missing infra/aws/config.env - copy config.env.example first." >&2; exit 1; }
# shellcheck disable=SC1091
source "$AWS_DIR/config.env"

: "${AWS_REGION:?Set AWS_REGION in infra/aws/config.env}"
PROJECT="${PROJECT:-ecms}"
STACK_NAME="${STACK_NAME:-ecms-prod}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION" AWS_PAGER=""
[[ -n "${AWS_PROFILE:-}" ]] && export AWS_PROFILE

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_cli() { command -v aws >/dev/null || die "aws CLI not found (install AWS CLI v2)."; }

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# ssm_run "<shell command, no double quotes>" - runs on the instance, streams result, fails on error.
ssm_run() {
  local cmd="$1" instance_id cmd_id status
  instance_id="$(stack_output InstanceId)"
  cmd_id="$(aws ssm send-command --instance-ids "$instance_id" \
    --document-name AWS-RunShellScript \
    --parameters "{\"commands\":[\"$cmd\"],\"executionTimeout\":[\"3600\"]}" \
    --cloud-watch-output-config "CloudWatchLogGroupName=/$PROJECT/ssm-commands,CloudWatchOutputEnabled=true" \
    --query 'Command.CommandId' --output text)"
  echo "SSM command $cmd_id running on $instance_id ..."
  while :; do
    sleep 10
    status="$(aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance_id" \
      --query Status --output text 2>/dev/null || echo Pending)"
    case "$status" in
      Success|Failed|Cancelled|TimedOut) break ;;
    esac
  done
  aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance_id" \
    --query '[StandardOutputContent,StandardErrorContent]' --output text
  [[ "$status" == Success ]] || die "Remote command finished with status $status (full output: CloudWatch log group /$PROJECT/ssm-commands)."
}
