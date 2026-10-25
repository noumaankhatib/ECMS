#!/usr/bin/env bash
# Bundles the repo working tree (tracked + untracked, minus .gitignore), uploads it to S3 and has the instance
# build and start it through SSM. No inbound SSH and no registry are involved.
source "$(dirname "$0")/lib.sh"
require_cli
cd "$REPO_ROOT"

BUCKET="$(stack_output BucketName)"
IP="$(stack_output PublicIp)"
RELEASE="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date +%Y%m%d%H%M%S)"
[[ -n "$(git status --porcelain 2>/dev/null)" ]] && echo "Note: working tree has uncommitted changes; they ARE included in this release ($RELEASE)."

if [[ -n "${DOMAIN:-}" ]]; then ORIGIN="https://$DOMAIN"; SECURE=true; else ORIGIN="http://$IP"; SECURE=false; fi

log "Bundling $RELEASE"
BUNDLE="$(mktemp -d)/ecms-$RELEASE.tar.gz"
git ls-files -co --exclude-standard | while IFS= read -r f; do [[ -e "$f" ]] && printf '%s\n' "$f"; done \
  | tar -czf "$BUNDLE" -T -
du -h "$BUNDLE" | cut -f1

log "Uploading to s3://$BUCKET/deploy/"
aws s3 cp "$BUNDLE" "s3://$BUCKET/deploy/ecms-$RELEASE.tar.gz" --sse AES256 --only-show-errors

log "Building and starting on the instance (first build takes several minutes)"
ssm_run "aws s3 cp s3://$BUCKET/deploy/ecms-$RELEASE.tar.gz /tmp/ecms-$RELEASE.tar.gz --only-show-errors && mkdir -p /opt/ecms/releases/$RELEASE && tar -xzf /tmp/ecms-$RELEASE.tar.gz -C /opt/ecms/releases/$RELEASE && rm -f /tmp/ecms-$RELEASE.tar.gz && bash /opt/ecms/releases/$RELEASE/infra/aws/server/remote-deploy.sh $RELEASE $ORIGIN $SECURE"

log "Checking from your machine"
for _ in $(seq 1 12); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$IP/api/health/ready" || true)"
  [[ "$code" == 200 ]] && { echo "http://$IP/api/health/ready -> 200"; echo "App: http://$IP/"; exit 0; }
  sleep 5
done
die "Health check from outside returned $code. Instance is up; check security group and 'ssm' logs."
