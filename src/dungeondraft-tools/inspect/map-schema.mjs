// Prints the key tree of a .dungeondraft_map with value kinds and example values (arrays show their first element).
// Usage: node src/dungeondraft-tools/inspect/map-schema.mjs <map> [depth=4]
import fs from 'node:fs';

const [file, depthArg] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node map-schema.mjs <map.dungeondraft_map> [depth]');
  process.exit(2);
}
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const maxDepth = Number(depthArg || 4);

function show(value, indent, key, depth) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    console.log(`${pad}${key}: array(${value.length})`);
    if (value.length && depth < maxDepth) { show(value[0], indent + 1, '[0]', depth + 1); }
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    console.log(`${pad}${key}: {${keys.length} keys}`);
    if (depth < maxDepth) {
      const limit = keys.length > 14 && keys.every((k) => /^\d+$/.test(k)) ? 3 : 40;
      keys.slice(0, limit).forEach((k) => show(value[k], indent + 1, k, depth + 1));
      if (keys.length > limit) { console.log(`${pad}  ... +${keys.length - limit} more keys`); }
    }
  } else {
    const text = JSON.stringify(value);
    console.log(`${pad}${key}: ${text.length > 90 ? text.slice(0, 90) + '…' : text}`);
  }
}
show(map, 0, 'root', 0);
