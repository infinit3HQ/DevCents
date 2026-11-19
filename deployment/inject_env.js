// Replaces a build-time placeholder with its runtime value in the built
// client/server bundles. Values are validated against a strict character set
// because they are spliced into JavaScript string literals.
const fs = require("fs");
const path = require("path");

const searchValue = process.env.SEARCH_VALUE;
const replaceValue = process.env.REPLACE_VALUE;
const kind = process.env.VALUE_KIND;

const PATTERNS = {
  // http(s) URL without quotes, backslashes, whitespace or angle brackets.
  url: /^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?(\/[A-Za-z0-9._~\-\/]*)?$/,
  // Clerk publishable keys: pk_test_/pk_live_ followed by base64.
  key: /^pk_(test|live)_[A-Za-z0-9+/=_\-$]+$/,
};

function fail(message) {
  console.error(`inject_env: ${message}`);
  process.exit(1);
}

if (!searchValue || !replaceValue) fail("SEARCH_VALUE and REPLACE_VALUE are required");
const pattern = PATTERNS[kind];
if (!pattern) fail(`VALUE_KIND must be one of ${Object.keys(PATTERNS).join(", ")}`);
if (!pattern.test(replaceValue)) fail(`value for ${searchValue} has an invalid format`);

let updated = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(js|mjs|cjs|html|json|map)$/.test(entry.name)) {
      const original = fs.readFileSync(fullPath, "utf8");
      if (!original.includes(searchValue)) continue;
      const tmpPath = `${fullPath}.tmp`;
      fs.writeFileSync(tmpPath, original.split(searchValue).join(replaceValue));
      fs.renameSync(tmpPath, fullPath);
      updated++;
    }
  }
}

walk(path.resolve(".output"));
console.log(`inject_env: set ${searchValue} in ${updated} file(s)`);
