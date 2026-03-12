#!/usr/bin/env bash
set -euo pipefail

# ─── DevCents Dev Environment ──────────────────────────────────────────────
# Starts Docker (Convex backend), Convex sync, and the Vite dev server.
# Press Ctrl+C to tear everything down.
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
COMPOSE_FILE="docker-compose.dev.yml"

: "${INSTANCE_NAME:=devcents}"
if [ -z "${INSTANCE_SECRET:-}" ]; then
  INSTANCE_SECRET="$(printf '%s' "${USER:-devcents}:${HOSTNAME:-localhost}:devcents" | shasum -a 256 | awk '{print $1}')"
fi
: "${CONVEX_SELF_HOSTED_URL:=http://127.0.0.1:3210}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:=${INSTANCE_NAME}|${INSTANCE_SECRET}}"

export INSTANCE_NAME INSTANCE_SECRET CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

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
CONVEX_PID=""
cleanup() {
  echo ""
  warn "Shutting down..."

  if [ -n "$CONVEX_PID" ] && kill -0 "$CONVEX_PID" 2>/dev/null; then
    log "Stopping Convex sync (PID $CONVEX_PID)..."
    kill "$CONVEX_PID" 2>/dev/null || true
    wait "$CONVEX_PID" 2>/dev/null || true
  fi

  log "Stopping Docker containers..."
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

log "Waiting for Convex backend on port 3210..."
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
ok "Convex backend is ready (took ${WAITED}s)"

# ─── 2. Start Convex sync (background) ──────────────────────────────────────
log "Starting Convex sync..."
npm run convex:local &
CONVEX_PID=$!
sleep 2

if ! kill -0 "$CONVEX_PID" 2>/dev/null; then
  err "Convex sync failed to start"
  exit 1
fi
ok "Convex sync running (PID $CONVEX_PID)"

# ─── 3. Start Vite dev server (foreground) ──────────────────────────────────
log "Starting Vite dev server on port 3000..."
echo ""
npm run dev
