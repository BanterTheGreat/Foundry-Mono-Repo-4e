// Look inside the installed Dungeondraft.pck (a Godot 3 archive): scenes, shaders, default assets and the game assembly.
// Usage:
//   node dd-pck.mjs ls [path-regex]                  list entries (images and imports hidden)
//   node dd-pck.mjs grep <line-regex> [path-regex]   search text files (default: .tscn .tres .shader .dungeondraft_* .material)
//   node dd-pck.mjs extract <path-suffix> <out>      write one entry to disk, e.g. Dungeondraft.dll
// The game logic is C# compiled into res://.mono/assemblies/Release/Dungeondraft.dll (sources are stripped from the pck);
// extract it and search it with strings.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { readPck, readEntry } from '../lib/lib.mjs';
import { DD_INSTALL_DIR } from '../config.mjs';

const [command, a, b] = process.argv.slice(2);
const pck = path.join(DD_INSTALL_DIR, 'Dungeondraft.pck');
const entries = readPck(pck);

if (command === 'ls') {
  const re = new RegExp(a || '.', 'i');
  for (const e of entries.filter((x) => re.test(x.path) && !/\.(png|import|stex|ogg|wav|webp|jpg)$/i.test(x.path))) { console.log(e.size, e.path); }
} else if (command === 'grep' && a) {
  const lineRe = new RegExp(a, 'i');
  const fileRe = new RegExp(b || '\\.(tscn|tres|shader|dungeondraft_\\w+|material)$', 'i');
  for (const e of entries.filter((x) => fileRe.test(x.path))) {
    readEntry(pck, e).toString('utf8').split('\n').forEach((line, i) => {
      if (lineRe.test(line)) { console.log(`${e.path.replace('res://', '')}:${i + 1}: ${line.trim().slice(0, 200)}`); }
    });
  }
} else if (command === 'extract' && a && b) {
  const e = entries.find((x) => x.path.endsWith(a));
  if (!e) { console.error(`No entry ending with ${a}`); process.exit(1); }
  fs.writeFileSync(path.resolve(b), readEntry(pck, e));
  console.log('wrote', e.path, e.size);
} else {
  console.error('Usage: dd-pck.mjs ls [regex] | grep <regex> [pathRegex] | extract <suffix> <out>');
  process.exit(2);
}
