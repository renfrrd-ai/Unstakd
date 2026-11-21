#!/usr/bin/env bash
# Pulls main and rebuilds the dashboard + worker on the VPS. Run by the GitHub Actions deploy
# workflow over SSH as a forced command (see docs/LATER.md § Auto-redeploy); safe to run by hand.
#
# The image is built before any container is replaced, so a failed build (or a failed migration)
# leaves the running dashboard and worker untouched. Deployed apps are separate containers and
# keep serving throughout.
set -euo pipefail

APP_DIR=/opt/unstakd
COMPOSE=(docker compose -f docker-compose.prod.yml)

cd "$APP_DIR"

# One redeploy at a time; a second push waits for the first to finish.
exec 9>/var/lock/unstakd-redeploy.lock
flock 9

log() { printf '==> %s\n' "$*"; }

log "Pulling main"
git fetch --quiet origin main
before=$(git rev-parse HEAD)
git merge --ff-only --quiet origin/main
after=$(git rev-parse HEAD)
log "${before:0:12} -> ${after:0:12}"

log "Building"
"${COMPOSE[@]}" build migrate app worker

log "Migrating and restarting dashboard + worker"
"${COMPOSE[@]}" up -d --no-build migrate app worker

"${COMPOSE[@]}" ps app worker
log "Removing dangling images"
docker image prune -f >/dev/null
log "Done"
