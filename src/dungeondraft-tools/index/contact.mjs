// Numbered contact sheet of search results, to browse textures visually.
// Or: --names "Pack:name[:kind],Pack:name" to render exact textures.
// Usage: node contact.mjs <out.png> [terms...] [--pack s] [--kind k] [--tag T] [--no-shadow] [--limit n] [--cols n] [--cell px] [--bg r,g,b]
// Prints "#N [pack] kind name WxH" for each cell. View the PNG with the Read tool.
import fs from 'node:fs';
import path from 'node:path';
import { PACK_DIR, loadRows, readPck, readEntry } from '../lib/lib.mjs';
import { decodePng, encodePng, Sprite, Canvas } from '../lib/png.mjs';
import { packs } from '../lib/packs.mjs';

const args = process.argv.slice(2);
const out = args.shift();
const o = { terms: [], limit: 24, cols: 6, cell: 200, bg: [96, 100, 108] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (['--pack', '--kind', '--tag'].includes(a)) {
    o[a.slice(2)] = args[++i].toLowerCase();
  } else if (['--limit', '--cols', '--cell'].includes(a)) {
    o[a.slice(2)] = Number(args[++i]);
  } else if (a === '--bg') {
    o.bg = args[++i].split(',').map(Number);
  } else if (a === '--names') {
    o.names = args[++i].split(',').map((x) => x.trim()).filter(Boolean);
  } else if (a === '--no-shadow') {
    o.noShadow = true;
  } else {
    o.terms.push(a.toLowerCase());
  }
}
const all = loadRows();
const byNames = o.names ? o.names.map((spec) => {
  const [p, n, k] = spec.split(':');
  const hit = all.find((r) => r.pack.toLowerCase().includes(p.toLowerCase()) && r.name.toLowerCase() === n.toLowerCase() && (!k || r.kind === k) && r.sub !== 'end');
  if (!hit) { console.error('NOT FOUND: ' + spec); }
  return hit;
}).filter(Boolean) : null;
const rows = byNames || all.filter((r) => {
  if (o.pack && !r.pack.toLowerCase().includes(o.pack)) { return false; }
  if (o.kind && r.kind !== o.kind) { return false; }
  if (o.tag && !r.tags.toLowerCase().split(',').includes(o.tag)) { return false; }
  if (o.noShadow && (r.tags.split(',').includes('Shadow') || /shadow/i.test(r.name))) { return false; }
  const hay = `${r.name} ${r.tags} ${r.pack}`.toLowerCase();
  return o.terms.every((t) => t.split('|').some((alt) => alt && hay.includes(alt)));
}).slice(0, o.limit);

const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
function label(c, n, x, y) {
  const s = String(n);
  const sc = 3;
  c.rect(x, y, s.length * 4 * sc + sc, 6 * sc, [255, 255, 255]);
  [...s].forEach((d, i) => {
    for (let k = 0; k < 15; k++) {
      if (FONT[d][k] === '1') {
        c.rect(x + sc + i * 4 * sc + (k % 3) * sc, y + 2 + Math.floor(k / 3) * sc, sc, sc, [0, 0, 0]);
      }
    }
  });
}
Canvas.prototype.rect = function (x, y, w, h, col) {
  x = Math.round(x); y = Math.round(y);
  for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
      const t = (j * this.w + i) * 4;
      this.data[t] = col[0]; this.data[t + 1] = col[1]; this.data[t + 2] = col[2];
    }
  }
};

const gridRows = Math.ceil(rows.length / o.cols) || 1;
const pad = 6;
const c = new Canvas(o.cols * (o.cell + pad) + pad, gridRows * (o.cell + pad) + pad, o.bg);
const tables = new Map();
rows.forEach((r, i) => {
  const file = packs().byName.get(r.pack).file;
  if (!tables.has(file)) { tables.set(file, readPck(file)); }
  const e = tables.get(file).find((x) => x.path.endsWith('/' + r.rel));
  const sp = new Sprite(decodePng(readEntry(file, e)));
  const cx = pad + (i % o.cols) * (o.cell + pad), cy = pad + Math.floor(i / o.cols) * (o.cell + pad);
  const fit = Math.min(o.cell / sp.w, o.cell / sp.h);
  const w = Math.max(1, sp.w * fit), h = Math.max(1, sp.h * fit);
  c.draw(sp, { cx: cx + o.cell / 2, cy: cy + o.cell / 2, w, h });
  label(c, i + 1, cx + 2, cy + 2);
  console.log(`#${i + 1} [${r.pack}] ${r.kind}${r.sub ? '/' + r.sub : ''} ${r.name} ${r.w}x${r.h}`);
});
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, encodePng(c.toImage()));
console.log('wrote', path.resolve(out));
