#!/bin/sh
# Checks the required settings, then starts the server. Public settings are
# served to browsers at runtime (see apps/web/src/lib/env.ts), so changing an
# env var and restarting is enough; no rebuild needed.
set -eu

: "${VITE_CONVEX_URL:?VITE_CONVEX_URL is required (public URL of your Convex backend)}"
: "${VITE_CLERK_PUBLISHABLE_KEY:?VITE_CLERK_PUBLISHABLE_KEY is required}"
: "${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is required}"
: "${DEVCENTS_SERVER_SECRET:?DEVCENTS_SERVER_SECRET is required (same value as in Convex)}"

case "$VITE_CONVEX_URL" in
  http://*|https://*) ;;
  *) echo "VITE_CONVEX_URL must start with http:// or https://" >&2; exit 1 ;;
esac

# Server-side code reads these directly.
export CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-$VITE_CLERK_PUBLISHABLE_KEY}"
export CONVEX_URL="${CONVEX_URL:-$VITE_CONVEX_URL}"

echo "Starting DevCents on port ${PORT:-3000}"
exec node /app/.output/server/index.mjs
