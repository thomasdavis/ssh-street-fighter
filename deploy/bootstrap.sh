#!/usr/bin/env bash
#
# sshfighter.com — one-shot provisioning for a fresh Ubuntu 22.04/24.04 box.
#
# What it does (idempotent — safe to re-run):
#   • installs system deps (build-essential for better-sqlite3), Node 22, pnpm, Caddy
#   • clones (or updates) the repo and installs deps
#   • writes /etc/sshfighter.env and installs the systemd unit
#   • adds a SECOND admin-SSH port (2222) alongside 22 — WITHOUT freeing 22 yet
#
# It deliberately does NOT take over port 22 or start the game there. That is the
# one step that can lock you out, so it lives in a separate, explicit script you
# run only AFTER confirming you can log in on the new admin port:
#     ssh -p 2222 <you>@<box>      # verify this works in a second terminal
#     sudo deploy/cutover-port-22.sh
#
# Usage (run as a sudo-capable user, NOT root directly, so $SUDO_USER is set):
#     sudo ADMIN_SSH_PORT=2222 deploy/bootstrap.sh
#
set -euo pipefail

REPO="${REPO:-https://github.com/thomasdavis/ssh-street-fighter.git}"
APP_USER="${APP_USER:-${SUDO_USER:-$(whoami)}}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/ssh-street-fighter}"
ADMIN_SSH_PORT="${ADMIN_SSH_PORT:-2222}"
NODE_MAJOR=22

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git build-essential python3 ufw debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]; then
  log "Node ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

log "pnpm (via corepack)"
corepack enable
corepack prepare pnpm@latest --activate

if ! command -v caddy >/dev/null; then
  log "Caddy (for sshfighter.com web + TLS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi

log "Clone / update repo at ${APP_DIR}"
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only
else
  sudo -u "${APP_USER}" git clone "${REPO}" "${APP_DIR}"
fi

log "Install dependencies (pnpm)"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pnpm install --frozen-lockfile"

log "Data dir + host key"
sudo -u "${APP_USER}" mkdir -p "${APP_DIR}/data" "${APP_DIR}/keys"

if [ ! -f /etc/sshfighter.env ]; then
  log "Write /etc/sshfighter.env"
  cat > /etc/sshfighter.env <<EOF
# sshfighter runtime config
SF_PORT=22
SF_HOST=0.0.0.0
SF_DB=${APP_DIR}/data/streetfighter.db
# Optional: only needed to (re)generate sprites from this box.
# OPENAI_API_KEY=
# Optional: Discord telemetry webhook.
# SF_DISCORD_WEBHOOK=
EOF
  chmod 640 /etc/sshfighter.env
  chown root:"${APP_USER}" /etc/sshfighter.env
fi

log "Install systemd unit"
sed -e "s|@APP_USER@|${APP_USER}|g" -e "s|@APP_DIR@|${APP_DIR}|g" \
  "${APP_DIR}/deploy/sshfighter.service" > /etc/systemd/system/sshfighter.service
systemctl daemon-reload

log "Add admin SSH port ${ADMIN_SSH_PORT} (keeping 22 until cutover)"
if ! grep -qE "^[#[:space:]]*Port ${ADMIN_SSH_PORT}\b" /etc/ssh/sshd_config; then
  printf '\n# sshfighter: temporary admin port during port-22 cutover\nPort 22\nPort %s\n' "${ADMIN_SSH_PORT}" >> /etc/ssh/sshd_config
fi
# Ubuntu 24.04 uses socket activation — disable it so sshd_config Port lines apply.
systemctl disable --now ssh.socket 2>/dev/null || true
systemctl restart ssh || systemctl restart sshd
systemctl enable ssh 2>/dev/null || systemctl enable sshd 2>/dev/null || true

log "Firewall (ufw)"
ufw allow 22/tcp    >/dev/null
ufw allow "${ADMIN_SSH_PORT}"/tcp >/dev/null
ufw allow 80/tcp    >/dev/null
ufw allow 443/tcp   >/dev/null
yes | ufw enable    >/dev/null || true

cat <<EOF

\033[1;32m==> Bootstrap complete.\033[0m

NEXT — do this before the game takes port 22 (avoids lockout):

  1. In a SECOND terminal, confirm the new admin port works:
         ssh -p ${ADMIN_SSH_PORT} ${APP_USER}@<this-box-ip>

  2. Only once that works, hand port 22 to the game:
         sudo ${APP_DIR}/deploy/cutover-port-22.sh

  3. Point DNS: an A record  sshfighter.com -> <this-box-ip>  (DNS-only / grey,
     so 'ssh sshfighter.com' reaches the game, not a proxy).

  4. (Optional) web homepage:  sudo ${APP_DIR}/deploy/setup-web.sh
EOF
