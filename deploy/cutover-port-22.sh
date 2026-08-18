#!/usr/bin/env bash
#
# Hand port 22 to the game. Run ONLY after you've confirmed you can log in on the
# admin port added by bootstrap.sh (default 2222):  ssh -p 2222 <you>@<box>
#
# It stops admin sshd from listening on 22, then starts the game there.
#
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

ADMIN_SSH_PORT="${ADMIN_SSH_PORT:-2222}"

echo "==> Removing 'Port 22' from admin sshd (leaving ${ADMIN_SSH_PORT})"
# Drop the plain 'Port 22' line bootstrap added; keep the admin port.
sed -i '/^Port 22$/d' /etc/ssh/sshd_config
grep -qE "^Port ${ADMIN_SSH_PORT}$" /etc/ssh/sshd_config || echo "Port ${ADMIN_SSH_PORT}" >> /etc/ssh/sshd_config
systemctl disable --now ssh.socket 2>/dev/null || true
systemctl restart ssh || systemctl restart sshd

echo "==> Starting the game on port 22"
systemctl enable --now sshfighter.service
sleep 1
systemctl --no-pager --lines=8 status sshfighter.service || true

cat <<EOF

==> Cutover done.
    Players:  ssh sshfighter.com
    You:      ssh -p ${ADMIN_SSH_PORT} <you>@sshfighter.com
EOF
