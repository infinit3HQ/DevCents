const fs = require('fs');
const path = require('path');

const searchValue = process.env.SEARCH_VALUE;
const replaceValue = process.env.REPLACE_VALUE;

if (!searchValue || !replaceValue) {
  console.error('Missing SEARCH_VALUE or REPLACE_VALUE');
  process.exit(1);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (/\.(js|mjs|html|css)$/.test(file)) {
      try {
        const originalBuffer = fs.readFileSync(fullPath);
        const originalString = originalBuffer.toString('utf8');
        if (originalString.includes(searchValue)) {
          console.log(`  Updating: ${fullPath} (${originalBuffer.length} bytes)`);
          const updatedString = originalString.split(searchValue).join(replaceValue);
          const updatedBuffer = Buffer.from(updatedString, 'utf8');
          
          const tmpPath = fullPath + '.tmp';
          fs.writeFileSync(tmpPath, updatedBuffer);
          fs.renameSync(tmpPath, fullPath);
          
          console.log(`    -> Done: ${updatedBuffer.length} bytes`);
        }
      } catch (e) {
        console.error(`  Error in ${fullPath}: ${e.message}`);
      }
    }
  });
}

console.log(`Injecting ${searchValue} -> (redacted, length ${replaceValue.length})`);
walk('.output');
