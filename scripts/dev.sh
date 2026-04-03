#!/usr/bin/env bash
set -euo pipefail

# ─── DevCents Dev Environment ──────────────────────────────────────────────
# Starts Docker (Convex backend), Convex sync, and the Vite dev server.
# Press Ctrl+C to tear everything down.
# Data is persisted across restarts via Docker volumes.
# To fully reset, run: docker compose -f docker-compose.dev.yml down -v
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
COMPOSE_FILE="docker-compose.dev.yml"

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

: "${INSTANCE_NAME:=devcents}"
if [ -z "${INSTANCE_SECRET:-}" ]; then
  INSTANCE_SECRET="$(printf '%s' "${USER:-devcents}:${HOSTNAME:-localhost}:devcents" | shasum -a 256 | awk '{print $1}')"
fi
: "${CONVEX_SELF_HOSTED_URL:=http://127.0.0.1:3210}"

export INSTANCE_NAME INSTANCE_SECRET CONVEX_SELF_HOSTED_URL

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${CYAN}[dev]${NC} $1"; }
ok()   { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err()  { echo -e "${RED}[dev]${NC} $1"; }

# ─── Cleanup on exit ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  warn "Shutting down..."

  log "Stopping Docker containers (data is preserved)..."
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

  ok "All services stopped. Goodbye!"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ─── Pre-flight checks ──────────────────────────────────────────────────────
for cmd in docker node npm npx; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Required command '$cmd' not found. Please install it first."
    exit 1
  fi
done

# ─── 1. Start Docker (Convex backend) ───────────────────────────────────────
log "Starting Docker containers..."
docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for Convex backend to be fully ready..."
MAX_WAIT=30
WAITED=0
until curl -sf http://127.0.0.1:3210 > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    err "Convex backend did not become ready within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done
# Give extra time for internal bootstrapping (search indexes, migrations)
sleep 3
ok "Convex backend is ready (took $((WAITED + 3))s)"

# ─── 1b. Auto-generate admin key from running container ─────────────────────
# The admin key is cryptographically derived inside the container from
# INSTANCE_SECRET. We always generate it from the container to ensure
# it matches, so you never need to manually manage it.
log "Generating admin key from Convex backend..."
GENERATED_KEY="$(docker exec devcents-convex-1 ./generate_admin_key.sh 2>/dev/null | grep -v 'Admin key:' | tr -d '[:space:]')"
if [ -z "$GENERATED_KEY" ]; then
  err "Failed to generate admin key from container"
  exit 1
fi
export CONVEX_SELF_HOSTED_ADMIN_KEY="$GENERATED_KEY"
ok "Admin key ready"

# ─── 2. Start Convex sync + Vite dev server (parallel) ──────────────────────
log "Starting Convex sync + Vite dev server..."
echo ""
npx concurrently \
  --names "convex,vite" \
  --prefix-colors "yellow,cyan" \
  --kill-others \
  --handle-input \
  "npm run convex:local" \
  "npm run dev"
