#!/bin/sh
set -eu

echo "Injecting runtime environment variables..."

BUILD_CONVEX_URL="__VITE_CONVEX_URL__"
BUILD_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"

TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}
TARGET_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-$BUILD_CLERK_PUBLISHABLE_KEY}

# Helper to replace placeholders in assets using Node.js (more robust than sed for special chars)
replace_in_assets() {
  build_value="$1"
  target_value="$2"
  
  echo "Replacing '$build_value' with '$target_value'..."
  
  # Use Node.js to perform the replacement to avoid escaping nightmares and file truncation
  node -e "
    const fs = require('fs');
    const path = require('path');
    const searchValue = process.argv[1];
    const replaceValue = process.argv[2];
    
    function walk(dir) {
      fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          walk(fullPath);
        } else if (/\.(js|mjs|html|css)$/.test(file)) {
          let content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes(searchValue)) {
            content = content.split(searchValue).join(replaceValue);
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log('  Updated: ' + fullPath);
          }
        }
      });
    }
    walk('.output');
  " "$build_value" "$target_value"
}

if [ -d ".output" ]; then
  echo "Injecting runtime configuration..."
  replace_in_assets "$BUILD_CONVEX_URL" "$TARGET_CONVEX_URL"
  replace_in_assets "$BUILD_CLERK_PUBLISHABLE_KEY" "$TARGET_CLERK_PUBLISHABLE_KEY"
fi

echo "Starting the application server..."
exec node .output/server/index.mjs
