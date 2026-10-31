// Extract textures from a pack so they can be viewed.
// Usage: node extract.mjs "<pack substr>" <name-or-rel-path> [outdir]
//   name: exact texture name (no .png, case-insensitive) or a rel path like textures/objects/bush_1a.png.
//   If no exact name matches, textures whose name contains the text are extracted instead (max 12).
import fs from 'node:fs';
import path from 'node:path';
import { INDEX_DIR, PACK_DIR, loadRows, readPck, readEntry } from '../lib/lib.mjs';
import { packs as allPacks } from '../lib/packs.mjs';

const [packArg, nameArg, outArg] = process.argv.slice(2);
if (!packArg || !nameArg) {
  console.error('Usage: node extract.mjs "<pack substr>" <name-or-rel-path> [outdir]');
  process.exit(2);
}
const outDir = outArg ? path.resolve(outArg) : path.join(INDEX_DIR, '_preview');
const pk = packArg.toLowerCase();
const nm = nameArg.toLowerCase().replace(/\.png$/, '');

const inPack = loadRows().filter((r) => r.pack.toLowerCase().includes(pk));
let hits = inPack.filter((r) => r.name.toLowerCase() === nm || r.rel.toLowerCase().replace(/\.png$/, '') === nm);
if (!hits.length) {
  hits = inPack.filter((r) => r.name.toLowerCase().includes(nm));
}
if (!hits.length) {
  console.error(`No texture matching "${nameArg}" in packs matching "${packArg}".`);
  process.exit(1);
}
const packs = new Set(hits.map((r) => r.pack));
if (packs.size > 1) {
  console.error(`Pack substring matches several packs with hits (${[...packs].join(', ')}); extracting all (max 12).`);
}
hits = hits.slice(0, 12);

fs.mkdirSync(outDir, { recursive: true });
const tableCache = new Map();
for (const r of hits) {
  const file = allPacks().byName.get(r.pack).file;
  if (!tableCache.has(file)) {
    tableCache.set(file, readPck(file));
  }
  const entry = tableCache.get(file).find((e) => e.path.endsWith('/' + r.rel));
  const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
  const dest = path.join(outDir, `${safe(r.pack)}__${r.kind}__${r.name.replace(/[^\w.-]+/g, '_')}${r.sub === 'end' ? '_end' : ''}.png`);
  fs.writeFileSync(dest, readEntry(file, entry));
  console.log(`${dest}  (${r.w}x${r.h})`);
}
