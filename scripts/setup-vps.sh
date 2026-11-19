#!/usr/bin/env bash
# Prepares a fresh Ubuntu VPS (24.04+) for Unstakd and starts the stack. Safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/unstakd/main/scripts/setup-vps.sh | sudo bash -s -- <git-url>
#
# What it does: firewall (22/80/443), key-only SSH, Docker, /var/lib/unstakd with the master
# key, a generated .env, then `docker compose up`. It never overwrites an existing key or .env.
set -euo pipefail

REPO_URL="${1:-}"
APP_DIR=/opt/unstakd
DATA_DIR=/var/lib/unstakd

if [[ $EUID -ne 0 ]]; then echo "run as root (sudo)"; exit 1; fi
log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

log "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades openssl

log "SSH: keys only"
if ! ls /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys >/dev/null 2>&1; then
  echo "No authorized_keys found. Add your SSH key before disabling passwords; skipping SSH hardening."
else
  cat > /etc/ssh/sshd_config.d/90-unstakd.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh || systemctl reload sshd || true
fi

log "Firewall: 22, 80, 443"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

log "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

log "Data dir and master key"
install -d -m 700 "$DATA_DIR" "$DATA_DIR/logs" "$DATA_DIR/backups"
if [[ ! -f $DATA_DIR/master.key ]]; then
  openssl rand -hex 32 > "$DATA_DIR/master.key"
  chmod 600 "$DATA_DIR/master.key"
  echo "Created $DATA_DIR/master.key. Copy it somewhere safe (password manager): without it, stored secrets can't be decrypted."
fi

log "App code"
if [[ ! -d $APP_DIR/.git ]]; then
  if [[ -z $REPO_URL ]]; then echo "pass the git URL of your Unstakd repo as the first argument"; exit 1; fi
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  log "Generating .env (fill in the blanks it lists)"
  cp .env.example .env
  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env SESSION_SECRET "$(openssl rand -hex 32)"
  set_env PLATFORM_DB_PASSWORD "$(openssl rand -hex 24)"
  set_env PLATFORM_REDIS_PASSWORD "$(openssl rand -hex 24)"
  set_env GITHUB_WEBHOOK_SECRET "$(openssl rand -hex 24)"
  set_env CADDY_HTTPS true
  set_env APP_URL "https://CHANGE-ME"
  echo
  echo "Edit $APP_DIR/.env and set: APP_URL, DASHBOARD_HOST, APPS_DOMAIN, EDGE_HOST, EDGE_IP,"
  echo "GITHUB_CLIENT_ID/SECRET, ALLOWED_GITHUB_LOGINS, CF_API_TOKEN, and R2_* for off-site backups."
  echo "Then re-run this script."
  exit 0
fi

if grep -q "CHANGE-ME" .env; then echo "Finish editing $APP_DIR/.env first."; exit 1; fi

log "Starting Unstakd"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
echo
echo "Done. Point *.$(grep ^APPS_DOMAIN= .env | cut -d= -f2) and $(grep ^EDGE_HOST= .env | cut -d= -f2) at this server's IP."
