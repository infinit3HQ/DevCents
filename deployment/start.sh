#!/bin/sh
# Fills the public runtime settings into a fresh copy of the build, then
# starts the server. Runs on every container start, so changing an env var
# and restarting is enough; no rebuild needed.
set -eu

: "${VITE_CONVEX_URL:?VITE_CONVEX_URL is required (public URL of your Convex backend)}"
: "${VITE_CLERK_PUBLISHABLE_KEY:?VITE_CLERK_PUBLISHABLE_KEY is required}"
: "${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is required}"
: "${DEVCENTS_SERVER_SECRET:?DEVCENTS_SERVER_SECRET is required (same value as in Convex)}"

TEMPLATE=/app/.output-template
OUTPUT=/app/.output

# Start from the pristine template each time.
find "$OUTPUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$TEMPLATE/." "$OUTPUT/"

cd /app
SEARCH_VALUE="__VITE_CONVEX_URL__" REPLACE_VALUE="$VITE_CONVEX_URL" VALUE_KIND=url \
  node /app/inject_env.js
SEARCH_VALUE="__VITE_CLERK_PUBLISHABLE_KEY__" REPLACE_VALUE="$VITE_CLERK_PUBLISHABLE_KEY" VALUE_KIND=key \
  node /app/inject_env.js

# Server-side code reads these directly.
export CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-$VITE_CLERK_PUBLISHABLE_KEY}"
export CONVEX_URL="${CONVEX_URL:-$VITE_CONVEX_URL}"

echo "Starting DevCents on port ${PORT:-3000}"
exec node "$OUTPUT/server/index.mjs"
