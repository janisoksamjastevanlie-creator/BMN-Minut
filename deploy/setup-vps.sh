#!/usr/bin/env bash
# Jalankan di VPS Ubuntu/Debian sebagai root:
#   DOMAIN=siman.contoh.com EMAIL=anda@contoh.com bash deploy/setup-vps.sh
# Prasyarat: DNS A record DOMAIN sudah mengarah ke IP VPS, dan
# file deploy/.env.production sudah disalin ke VPS di folder repo ini.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN}"
: "${EMAIL:?Set EMAIL}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_SRC="$APP_DIR/deploy/.env.production"
[ -f "$ENV_SRC" ] || { echo "Tidak ada $ENV_SRC"; exit 1; }

apt-get update
apt-get install -y curl nginx mariadb-server certbot python3-certbot-nginx git ufw
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

DB_USER=$(grep '^DB_USER=' "$ENV_SRC" | cut -d'"' -f2)
DB_PASS=$(grep '^DB_PASSWORD=' "$ENV_SRC" | cut -d'"' -f2)
DB_NAME=$(grep '^DB_NAME=' "$ENV_SRC" | cut -d'"' -f2)
mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;"

cd "$APP_DIR"
sed "s#https://DOMAIN_ANDA#https://$DOMAIN#" "$ENV_SRC" > .env
chmod 600 .env
npm ci
npm run build

sed "s/__DOMAIN__/$DOMAIN/" deploy/nginx-bmn-minut.conf > /etc/nginx/sites-available/bmn-minut
ln -sf /etc/nginx/sites-available/bmn-minut /etc/nginx/sites-enabled/bmn-minut
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect

pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null

ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw --force enable

sleep 3
curl -fsS "https://$DOMAIN/api/health" && echo && echo "OK. Webhook Fonnte: https://$DOMAIN/api/whatsapp/webhook"
