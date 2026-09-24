#!/usr/bin/env bash
# Ships the current checkout to the server and (re)starts the stack.
#   scripts/deploy/deploy.sh <ssh-target>        e.g. root@203.0.113.10
# Expects (both git-ignored): .env.production and docker/caddy/certs/origin.{pem,key}.
set -euo pipefail

TARGET=${1:?usage: deploy.sh <ssh-target>}
APP_DIR=/opt/deathspot
[ -f .env.production ] || { echo "missing .env.production (node scripts/setup-env.mjs --out .env.production)"; exit 1; }

echo "==> Sync code"
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .next --exclude coverage --exclude developer-docs \
  --exclude '.env' --exclude '.env.*' --exclude '/docker/caddy/certs' --exclude .claude \
  ./ "$TARGET:$APP_DIR/"

echo "==> Secrets"
rsync -az --chmod=F600 .env.production "$TARGET:$APP_DIR/.env"
rsync -az --chmod=D700,F600 docker/caddy/certs/origin.pem docker/caddy/certs/origin.key "$TARGET:$APP_DIR/docker/caddy/certs/"

echo "==> Build and start"
ssh "$TARGET" "cd $APP_DIR && docker compose --profile https up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "==> Wait for the app"
ssh "$TARGET" 'for i in $(seq 1 60); do s=$(docker compose -f /opt/deathspot/docker-compose.yml ps app --format "{{.Status}}"); case "$s" in *"(healthy)"*) echo "app: $s"; exit 0;; esac; sleep 5; done; docker compose -f /opt/deathspot/docker-compose.yml logs --tail 50 app; exit 1'
ssh "$TARGET" "cd $APP_DIR && docker compose ps --format '{{.Service}}: {{.Status}}'"
