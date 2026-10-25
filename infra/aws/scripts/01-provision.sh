#!/usr/bin/env bash
# Creates or updates the CloudFormation stack and waits until the instance is manageable via SSM.
source "$(dirname "$0")/lib.sh"
require_cli
: "${ALERT_EMAIL:?Set ALERT_EMAIL in config.env}"

log "Checking credentials"
aws sts get-caller-identity --query '[Account,Arn]' --output text
echo "Region: $AWS_REGION   (Ctrl-C now if this is the wrong account or region)"
sleep 5

INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
offered="$(aws ec2 describe-instance-type-offerings --location-type region \
  --filters "Name=instance-type,Values=$INSTANCE_TYPE" --query 'InstanceTypeOfferings[0].InstanceType' --output text)"
[[ "$offered" == "$INSTANCE_TYPE" ]] || die "$INSTANCE_TYPE is not offered in $AWS_REGION. Pick another type or region."

# Pin the AMI: reuse the stack's current one on updates so the instance is never replaced by a new AMI release.
IMAGE_ID="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Parameters[?ParameterKey=='ImageId'].ParameterValue" --output text 2>/dev/null || true)"
if [[ -z "$IMAGE_ID" || "$IMAGE_ID" == None ]]; then
  IMAGE_ID="$(aws ssm get-parameter \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)"
fi
echo "AMI: $IMAGE_ID"

log "Deploying stack $STACK_NAME"
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$AWS_DIR/cloudformation/ecms-ec2.yaml" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    ProjectName="$PROJECT" ImageId="$IMAGE_ID" InstanceType="$INSTANCE_TYPE" \
    RootVolumeGiB="${ROOT_VOLUME_GIB:-30}" AlertEmail="$ALERT_EMAIL" \
    MonthlyBudgetUsd="${MONTHLY_BUDGET_USD:-100}"

INSTANCE_ID="$(stack_output InstanceId)"
log "Waiting for the instance to register with SSM (first boot installs Docker; up to ~10 min)"
for _ in $(seq 1 60); do
  ping="$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)"
  [[ "$ping" == Online ]] && break
  sleep 10
done
[[ "${ping:-}" == Online ]] || die "Instance not reachable via SSM yet. Check the EC2 console, then re-run."

echo "Waiting for first-boot bootstrap to finish ..."
ssm_run 'for i in $(seq 1 60); do [ -f /opt/ecms/.bootstrapped ] && exit 0; sleep 10; done; echo bootstrap not finished; tail -n 30 /var/log/ecms-bootstrap.log; exit 1'

log "Done"
echo "Elastic IP : $(stack_output PublicIp)"
echo "Bucket     : $(stack_output BucketName)"
echo "Open your inbox: confirm the AWS SNS subscription email, or alarms and budget alerts will not reach you."
echo "Next: scripts/02-secrets.sh"
