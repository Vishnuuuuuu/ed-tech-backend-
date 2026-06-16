#!/usr/bin/env bash
#
# Deploy / update the backend on the VPS and keep it alive with pm2.
# Usage:  ./deploy.sh
# Prereqs: pnpm + pm2 installed, and a .env file present in this directory
#          (PORT, MONGODB_URI, ANTHROPIC_API_KEY, CORS_ORIGIN).
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

echo "==> Pulling latest from git…"
git pull --ff-only

echo "==> Installing dependencies (frozen lockfile)…"
pnpm install --frozen-lockfile

echo "==> Starting / reloading via pm2…"
# startOrReload starts the app if it isn't running, or zero-downtime reloads it.
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

PORT="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-4000}"

echo "==> Waiting for the server to come up…"
for i in $(seq 1 20); do
  if curl -fsS "http://localhost:${PORT}/status" >/dev/null 2>&1; then
    echo "==> Up. Status:"
    curl -fsS "http://localhost:${PORT}/status"; echo
    pm2 status slp-backend
    exit 0
  fi
  sleep 1
done

echo "ERROR: server did not respond on /status within 20s. Recent logs:" >&2
pm2 logs slp-backend --lines 30 --nostream || true
exit 1
