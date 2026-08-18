#!/usr/bin/env bash
#
# Optional: build + serve the sshfighter.com web homepage (sprite gallery) and
# wire up Caddy for HTTPS. Run after bootstrap.sh. The SSH game does not need this.
#
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

APP_USER="${APP_USER:-${SUDO_USER:-$(whoami)}}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/ssh-street-fighter}"

echo "==> Build web (Next.js)"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}/web' && pnpm install && pnpm build"

echo "==> Install web systemd unit"
sed -e "s|@APP_USER@|${APP_USER}|g" -e "s|@APP_DIR@|${APP_DIR}|g" \
  "${APP_DIR}/deploy/sshfighter-web.service" > /etc/systemd/system/sshfighter-web.service
systemctl daemon-reload
systemctl enable --now sshfighter-web.service

echo "==> Caddy"
cp "${APP_DIR}/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Web up on :3130, proxied at https://sshfighter.com"
