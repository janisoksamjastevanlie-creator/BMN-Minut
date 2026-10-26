#!/usr/bin/env bash
# Jalankan SETELAH DNS domain sudah mengarah ke IP VPS (dengan setup-vps.sh).
#   DOMAIN=bmn.contoh.com EMAIL=anda@bpsminut.go.id bash deploy/enable-ssl.sh
set -euo pipefail

: "${DOMAIN:?Set DOMAIN}"
: "${EMAIL:?Set EMAIL}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

sed -i "s#__DOMAIN__#$DOMAIN#" /etc/nginx/sites-available/bmn-minut
ln -sf /etc/nginx/sites-available/bmn-minut /etc/nginx/sites-enabled/bmn-minut
nginx -t && systemctl reload nginx

certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect

# Perbarui APP_PUBLIC_URL agar tautan WhatsApp memakai HTTPS.
cd "$APP_DIR"
sed -i "s#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=\"https://$DOMAIN\"#" .env
chmod 600 .env
pm2 restart bmn-minut

sleep 2
curl -fsS "https://$DOMAIN/api/health" && echo && echo "OK. HTTPS aktif di https://$DOMAIN"
