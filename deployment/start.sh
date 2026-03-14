#!/bin/sh
set -eu

echo "Injecting runtime environment variables..."
df -h /app

BUILD_CONVEX_URL="__VITE_CONVEX_URL__"
BUILD_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"

TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}
TARGET_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-$BUILD_CLERK_PUBLISHABLE_KEY}

# Helper to replace placeholders in assets using our robust Node.js script
replace_in_assets() {
  export SEARCH_VALUE="$1"
  export REPLACE_VALUE="$2"
  
  # Pass variables through environment to avoid any shell escaping/mangling issues
  node deployment/inject_env.js
}

if [ -d ".output" ]; then
  echo "Injecting runtime configuration..."
  replace_in_assets "$BUILD_CONVEX_URL" "$VITE_CONVEX_URL"
  replace_in_assets "$BUILD_CLERK_PUBLISHABLE_KEY" "$VITE_CLERK_PUBLISHABLE_KEY"
fi

echo "Starting the application server..."
exec node .output/server/index.mjs
