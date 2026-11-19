#!/bin/sh
# Pushes the DevCents Convex functions and required env vars to a
# self-hosted Convex backend. Safe to run on every start: deploys are
# idempotent.
set -eu

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required (e.g. http://convex:3210)}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?CONVEX_SELF_HOSTED_ADMIN_KEY is required. Generate it with: docker compose exec convex ./generate_admin_key.sh}"
: "${CLERK_ISSUER_URL:?CLERK_ISSUER_URL is required}"
: "${DEVCENTS_SERVER_SECRET:?DEVCENTS_SERVER_SECRET is required}"

CONVEX=./node_modules/.bin/convex
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

echo "Waiting for Convex at $CONVEX_SELF_HOSTED_URL ..."
i=0
until node -e 'fetch(process.argv[1]).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))' "$CONVEX_SELF_HOSTED_URL/version"; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Convex backend did not become reachable" >&2
    exit 1
  fi
  sleep 2
done

echo "Setting Convex environment variables..."
"$CONVEX" env set CLERK_ISSUER_URL "$CLERK_ISSUER_URL" >/dev/null
"$CONVEX" env set DEVCENTS_SERVER_SECRET "$DEVCENTS_SERVER_SECRET" >/dev/null

echo "Deploying Convex functions..."
"$CONVEX" deploy --yes
echo "Convex functions deployed."
