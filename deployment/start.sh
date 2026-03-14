#!/bin/sh
set -eu

echo "Injecting runtime environment variables..."
df -h /app

BUILD_CONVEX_URL="__VITE_CONVEX_URL__"
BUILD_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"

TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}
TARGET_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-$BUILD_CLERK_PUBLISHABLE_KEY}

echo "Starting the application server..."
exec node .output/server/index.mjs
