#!/bin/sh
set -eu

echo "Injecting runtime environment variables..."

BUILD_CONVEX_URL="__VITE_CONVEX_URL__"
BUILD_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"

TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}
TARGET_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-$BUILD_CLERK_PUBLISHABLE_KEY}

replace_in_assets() {
  build_value="$1"
  target_value="$2"
  escaped_target_value=$(printf '%s' "$target_value" | sed 's/[&|\\]/\\&/g')

  find .output/public -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.html' \) -exec sed -i "s|$build_value|$escaped_target_value|g" {} +
}

if [ -d ".output/public" ]; then
  echo "Replacing runtime config in static assets..."
  replace_in_assets "$BUILD_CONVEX_URL" "$TARGET_CONVEX_URL"
  replace_in_assets "$BUILD_CLERK_PUBLISHABLE_KEY" "$TARGET_CLERK_PUBLISHABLE_KEY"
fi

echo "Starting the application server..."
exec node .output/server/index.mjs
