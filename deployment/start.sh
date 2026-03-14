#!/bin/sh
set -eu

echo "Injecting runtime environment variables..."
df -h /app

BUILD_CONVEX_URL="__VITE_CONVEX_URL__"
BUILD_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"

TARGET_CONVEX_URL=${VITE_CONVEX_URL:-$BUILD_CONVEX_URL}
TARGET_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-$BUILD_CLERK_PUBLISHABLE_KEY}

# Helper to replace placeholders in assets using Node.js (more robust than sed for special chars)
replace_in_assets() {
  build_value="$1"
  target_value="$2"
  
  # Trim whitespaces/newlines/carriage returns
  clean_target=$(echo -n "$target_value" | tr -d '\n\r ' || echo "$target_value")
  
  echo "Replacing '$build_value' with (redacted value of length ${#clean_target})..."
  
  # Use Node.js to perform an atomic replacement
  node -e "
    const fs = require('fs');
    const path = require('path');
    const searchValue = process.argv[1];
    const replaceValue = process.argv[2];
    
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          walk(fullPath);
        } else if (/\.(js|mjs|html|css)$/.test(file)) {
          try {
            const original = fs.readFileSync(fullPath, 'utf8');
            if (original.includes(searchValue)) {
              const updated = original.split(searchValue).join(replaceValue);
              const tmpPath = fullPath + '.tmp';
              fs.writeFileSync(tmpPath, updated, 'utf8');
              fs.renameSync(tmpPath, fullPath); // Atomic move
              console.log('  Updated: ' + fullPath + ' (' + original.length + ' -> ' + updated.length + ' bytes)');
            }
          } catch (e) {
            console.error('  Error updating ' + fullPath + ': ' + e.message);
          }
        }
      });
    }
    walk('.output');
  " "$build_value" "$clean_target"
}

if [ -d ".output" ]; then
  echo "Injecting runtime configuration..."
  replace_in_assets "$BUILD_CONVEX_URL" "$TARGET_CONVEX_URL"
  replace_in_assets "$BUILD_CLERK_PUBLISHABLE_KEY" "$TARGET_CLERK_PUBLISHABLE_KEY"
fi

echo "Starting the application server..."
exec node .output/server/index.mjs
