#!/bin/sh

# This script runs before the Node server starts to inject runtime environment variables
# into the compiled frontend assets if needed.
# Since TanStack Start apps running on Nitro process SSR requests dynamically, 
# server-side code can access `process.env`.
# However, client-side code compiled by Vite typically has `VITE_` variables baked in at build time.
# To make it dynamic without rebuilding, we do a find-and-replace on the compiled static assets.

echo "Injecting runtime environment variables..."

# Default fallback values for injection based on build-time constants
BUILD_CONVEX_URL="http://127.0.0.1:3210"

# Target variables (what we want to replace with)
# If VITE_CONVEX_URL is not set dynamically at runtime, use the default string so it doesn't break
TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}

# Perform replacement in all .js and .mjs files in the public/static output directories.
# Nitro outputs static assets usually to .output/public
if [ -d ".output/public" ]; then
  echo "Replacing Convex URL in static assets..."
  find .output/public -type f \( -name '*.js' -o -name '*.mjs' \) -exec sed -i "s|$BUILD_CONVEX_URL|$TARGET_CONVEX_URL|g" {} +
fi

# We can add more replacements here if needed (like VITE_CLERK_PUBLISHABLE_KEY)
# But note that doing regex replacement on minified code can be tricky. 
# Providing them as standard ENV vars is the primary way for the server.

echo "Starting the application server..."
exec node .output/server/index.mjs
