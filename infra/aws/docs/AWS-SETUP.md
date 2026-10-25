# ECMS on a fresh AWS account (one server, about $22-25/month)

What you get: one EC2 server running the existing docker stack (Postgres, API, web, nginx), reached at
`http://<Elastic IP>/`. No SSH port, no load balancer, no NAT, no RDS, no ECR. Deploys are built on the server.
Backups go to a private S3 bucket every night, plus daily disk snapshots.

> Pricing and free-plan terms change. The numbers below are estimates from public list prices; confirm them in
> the AWS Billing console and on the EC2 / VPC pricing pages before you rely on them.

## 0. Cost estimate (24/7, one `t3.small`)

| Item | About per month |
|---|---|
| EC2 `t3.small` (2 vCPU, 2 GB) | $15-17 (region dependent) |
| Public IPv4 / Elastic IP (charged hourly since 2024) | $3.65 |
| EBS 30 GiB gp3 | $2.5-3 |
| EBS snapshots (3 kept, incremental) | $0.5-1.5 |
| S3 backups, CloudWatch logs/alarms, SSM | $0-2 |
| **Total** | **about $22-25** |

New accounts get credits (check **Billing > Credits** for your balance and expiry). At this rate $100 lasts
roughly 4 months. A budget alert fires at 50% / 80% / forecast 100% of `MONTHLY_BUDGET_USD` (default 100).
`t3.micro` (1 GB) is too small for the Next.js build and 50 MB uploads; do not use it.

## 1. Manual steps in the AWS Console (cannot be scripted)

1. Create the AWS account (email, payment card, phone verification). Pick the **free plan** if offered.
2. Sign in as root, enable **MFA** (Security credentials > Assign MFA device).
3. Billing > **Billing preferences**: turn on "Receive Free Tier usage alerts" and "Receive billing alerts".
4. Create an admin user for daily work (do not use root): **IAM Identity Center** (recommended) or an IAM user with
   `AdministratorAccess` and MFA. Never create root access keys.
5. Choose a region (top-right selector) and use that same one for everything.
6. If EC2 launch fails with a vCPU quota message, open Service Quotas and request "Running On-Demand Standard
   instances" = 2 or more.

## 2. Install tools and log the CLI in (your laptop)

- AWS CLI v2, git, curl, openssl. (No Docker needed locally.)
- Identity Center: `aws configure sso --profile ecms`, then `aws sso login --profile ecms`.
  IAM user: `aws configure --profile ecms` (access key from the IAM console; never commit it).
- Check: `aws sts get-caller-identity --profile ecms` shows the NEW account id.

## 3. Configure

```bash
cd infra/aws
cp config.env.example config.env     # gitignored
# edit: AWS_REGION (required), ALERT_EMAIL (required), AWS_PROFILE
```
`DOMAIN` stays empty for now (plain HTTP on the IP). Region is only ever read from `config.env`.

## 4. Build the infrastructure

```bash
./scripts/01-provision.sh     # stack + waits for the server (5-10 min)
./scripts/02-secrets.sh       # random DB passwords + session secret into SSM Parameter Store
./scripts/03-deploy.sh        # bundle, upload to S3, build + migrate + start on the server (first build ~5-10 min)
./scripts/04-create-admin.sh admin "Site Administrator"   # prompts for a 12+ char password
```
After `01`, open the email from AWS Notifications and **confirm the SNS subscription**, otherwise alarms and
the budget email never arrive (manual).

`03-deploy.sh` ships the working tree, including uncommitted files. Re-run it for every release; the last 3 releases
stay on the server and a failed health check rolls back automatically (database migrations are not reverted).

Open `http://<Elastic IP>/` (printed at the end) and sign in.

## 5. Validation checklist

- [ ] `curl -i http://<IP>/api/health/ready` returns 200
- [ ] Login works and stays logged in after a page reload (if it bounces back to login, `COOKIE_SECURE` is wrong for HTTP)
- [ ] Create a project, upload a PDF, download it back
- [ ] `aws ssm start-session --target <instance-id>` opens a shell (no SSH needed); `docker ps` shows 4 healthy containers
- [ ] Port scan shows only 80 open: `nmap -Pn -p 22,80,443,3000,3001,5432 <IP>`
- [ ] Logs appear in CloudWatch groups `/ecms/api`, `/ecms/web`, `/ecms/nginx`, `/ecms/postgres`
- [ ] Run a backup now and see it in S3:
  `aws ssm start-session ...` then `sudo /opt/ecms/backup.sh manual`; check `s3://<bucket>/backups/postgres/`
- [ ] Restore test on a throwaway change: create a record, `sudo /opt/ecms/restore.sh latest`, confirm the record is gone
- [ ] Reboot the instance; the site returns on its own
- [ ] Billing > Budgets shows `ecms-monthly`; Billing > Credits shows your balance

## 6. Operating it

| Task | How |
|---|---|
| Deploy new code | `./scripts/03-deploy.sh` |
| Shell on the server | `aws ssm start-session --target $(aws cloudformation describe-stacks --stack-name ecms-prod --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)` |
| App logs | CloudWatch Logs `/ecms/api` etc., or on the server `cd /opt/ecms/current && sudo docker compose -p ecms --env-file /opt/ecms/.env -f infra/aws/docker-compose.aws.yml logs -f api` |
| Restore a backup | on the server: `sudo /opt/ecms/restore.sh latest` (or a file name from the bucket) |
| Reset a password | `./scripts/04-create-admin.sh <existing-username> "<Name>"` |
| Resize | change `INSTANCE_TYPE` in `config.env`, run `01-provision.sh` (instance restarts, IP is kept) |

## 7. Adding a domain and HTTPS later

HTTP sends passwords and session cookies unencrypted. Use it for a short pilot over a trusted network only.

1. Buy a domain; create an **A record** pointing to the Elastic IP.
2. Add inbound **443** to `WebSecurityGroup` in `cloudformation/ecms-ec2.yaml`; run `01-provision.sh`.
3. Get a certificate on the server (certbot standalone, or switch the `nginx` service to Caddy) and use
   `docker/nginx/nginx.conf.ssl-example` as the starting point: mount the certs and publish `443:443` in
   `docker-compose.aws.yml`. This step is not automated yet.
4. Set `DOMAIN=your.domain` in `config.env` and run `03-deploy.sh`. That switches `CORS_ORIGINS` to `https://...`
   and `COOKIE_SECURE=true`.

## 8. Known limits

- Single server: a failed host is auto-recovered by the status alarm, but expect a few minutes of downtime.
- Uploaded files are stored in Postgres (`DRIVE_BACKEND=postgres`), so the DB and backups grow with uploads. Moving files to S3 needs an app change (the existing adapter targets Cloudflare R2).
- The login rate limiter is in memory; do not run more than one API container.
- Burstable CPU: an alarm fires if credits run low; move to `t3.medium` if so.

## 9. Cleanup (stop all charges)

```bash
./scripts/99-teardown.sh      # asks you to type the stack name; deletes everything below
```
It removes the stack (instance, volume, Elastic IP, VPC, alarms, budget, log groups), the S3 bucket and every backup
in it, the SSM secrets, and the EBS snapshots (snapshots survive stack deletion and keep billing otherwise).
Afterwards check in the console: EC2 > Elastic IPs / Volumes / Snapshots, S3, and the next day's Billing page.
Copy backups elsewhere first if you need the data. To only pause costs, stopping the instance still bills for the disk
and the Elastic IP, so teardown is the only way to reach roughly $0.
