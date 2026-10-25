#!/usr/bin/env bash
# Deletes EVERYTHING this project created in the account: stack, bucket contents (incl. backups),
# secrets and leftover EBS snapshots. Irreversible. Take a manual backup copy first if you need the data.
source "$(dirname "$0")/lib.sh"
require_cli
aws sts get-caller-identity --query '[Account,Arn]' --output text
echo "This permanently deletes stack $STACK_NAME in $AWS_REGION, its S3 backups, SSM secrets and snapshots."
read -r -p "Type the stack name to confirm: " answer
[[ "$answer" == "$STACK_NAME" ]] || die "Aborted."

BUCKET="$(stack_output BucketName 2>/dev/null || true)"
if [[ -n "$BUCKET" && "$BUCKET" != None ]]; then
  log "Emptying s3://$BUCKET (all versions)"
  aws s3 rm "s3://$BUCKET" --recursive --only-show-errors || true
  for kind in Versions DeleteMarkers; do
    aws s3api list-object-versions --bucket "$BUCKET" --query "$kind[].[Key,VersionId]" --output text 2>/dev/null \
      | while read -r key vid; do
          [[ -n "$key" && "$key" != None ]] && aws s3api delete-object --bucket "$BUCKET" --key "$key" --version-id "$vid" >/dev/null
        done
  done
fi

log "Deleting stack (instance, Elastic IP, VPC, alarms, budget, log groups)"
aws cloudformation delete-stack --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"

log "Deleting SSM parameters"
for p in $(aws ssm get-parameters-by-path --path "/$PROJECT/prod" --query 'Parameters[].Name' --output text); do
  aws ssm delete-parameter --name "$p"
done
aws ssm delete-parameter --name "/$PROJECT/prod-tmp/admin-password" >/dev/null 2>&1 || true

log "Deleting EBS snapshots tagged Project=$PROJECT (these keep billing after the stack is gone)"
for s in $(aws ec2 describe-snapshots --owner-ids self --filters "Name=tag:Project,Values=$PROJECT" \
    --query 'Snapshots[].SnapshotId' --output text); do
  aws ec2 delete-snapshot --snapshot-id "$s" && echo "deleted $s"
done
echo "Done. Then check the console: EC2 > Elastic IPs, Volumes, Snapshots; S3; and Billing > Bills next day."
