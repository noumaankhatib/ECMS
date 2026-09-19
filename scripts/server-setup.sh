#!/usr/bin/env bash
# Run once on a fresh Ubuntu 24.04 Hostinger VPS as root.
# Sets up Docker, clones the repo, and starts the stack.
set -euo pipefail

echo "==> Installing Docker"
apt-get update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "==> Installing AWS CLI (for R2 backups)"
apt-get install -y awscli

echo "==> Installing Certbot (SSL)"
apt-get install -y certbot

echo "==> Creating app directory"
mkdir -p /opt/ecms
cd /opt/ecms

echo ""
echo "==> Done. Next steps:"
echo "  1. Copy your project files to /opt/ecms (git clone or scp)"
echo "  2. Copy .env.production.example to /opt/ecms/.env and fill in values"
echo "  3. Run SSL setup:"
echo "       certbot certonly --standalone -d YOUR_DOMAIN.COM"
echo "       mkdir -p /opt/ecms/docker/nginx/certs"
echo "       cp /etc/letsencrypt/live/YOUR_DOMAIN.COM/fullchain.pem /opt/ecms/docker/nginx/certs/"
echo "       cp /etc/letsencrypt/live/YOUR_DOMAIN.COM/privkey.pem   /opt/ecms/docker/nginx/certs/"
echo "  4. Edit docker/nginx/nginx.conf — replace YOUR_DOMAIN.COM"
echo "  5. Run migrations:"
echo "       docker compose -f docker-compose.prod.yml run --rm api node apps/api/dist/tools/migrate.js"
echo "  6. Start the stack:"
echo "       docker compose -f docker-compose.prod.yml up -d"
echo "  7. Add backup cron job:"
echo "       echo '0 2 * * * root bash /opt/ecms/scripts/backup.sh >> /var/log/ecms-backup.log 2>&1' > /etc/cron.d/ecms-backup"
