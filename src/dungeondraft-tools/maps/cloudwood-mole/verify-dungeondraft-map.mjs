// Independent checks for the generated Cloudwood mole map (we cannot launch Dungeondraft from here): structure against a real map
// of the same build, asset paths, array sizes, geometry against the encounter grid (re-derived here from the HTML on purpose, not
// from structure.mjs, so a mistake in the structure shows up as a mismatch) and the user's mapping rules.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REFERENCE_MAP, REPO_DIR } from '../../config.mjs';
import { loadRows } from '../../lib/lib.mjs';
import { packs } from '../../lib/packs.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, isShadowTexture } from '../../lib/shadows.mjs';

const ENCOUNTER = 'cloudwood-mole';
const S = 256, BASE_COLS = 18, BASE_ROWS = 14, PAD = 1;
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const MAP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(MAPS_OUT_DIR, ENCOUNTER, `${ENCOUNTER}.dungeondraft_map`);
const REF = arg('--ref', REFERENCE_MAP);
const HTML = arg('--html', path.join(REPO_DIR, 'output', 'encounters', `${ENCOUNTER}.html`));
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('FAIL:', msg); } };
const vec = (s) => s.replace('Vector2', '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };
const poolLen = (s) => s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').length;

// The encounter, read again here: "(c,r) <terrain>, elevation +N feet"
const base = new Map();
for (const m of fs.readFileSync(HTML, 'utf8').matchAll(/title="\((\d+),(\d+)\) ([^,"]+), elevation \+(\d+) feet/g)) { base.set(`${m[1]},${m[2]}`, { label: m[3], elev: Number(m[4]) }); }
ok(base.size === BASE_COLS * BASE_ROWS, `encounter grid has ${base.size} cells`);
const W = BASE_COLS + 2 * PAD, H = BASE_ROWS + 2 * PAD;
/** Cell in extended numbering; added squares copy the nearest original square. */
const cell = (c, r) => {
  const src = base.get(`${Math.max(1, Math.min(BASE_COLS, c - PAD))},${Math.max(1, Math.min(BASE_ROWS, r - PAD))}`);
  const ext = c - PAD < 1 || c - PAD > BASE_COLS || r - PAD < 1 || r - PAD > BASE_ROWS;
  return { ...src, ext, label: ext && src.label !== 'Stream / wet undergrowth' ? 'Firm trail / clearing' : src.label };
};
const cells = [];
for (let r = 1; r <= H; r++) { for (let c = 1; c <= W; c++) { cells.push({ c, r, ...cell(c, r) }); } }
const centre = (c) => [(c.c - 0.5) * S, (c.r - 0.5) * S];
const STAIR = 'Root stair / worn ascent', STREAM = 'Stream / wet undergrowth', PLANK = 'Plank crossing', TRUNK = 'Massive tree trunk', LOG = 'Fallen log', THORN = 'Thorn hollow', CACHE = "Guide's waypoint cache";

// 1. structure vs a real map made by the same Dungeondraft build: identical key sets and order, same value kinds
function shape(v) {
  if (v === null) { return 'null'; }
  if (Array.isArray(v)) { return 'array'; }
  if (typeof v === 'string') { const m = v.match(/^(Vector2|Pool\w+Array|PoolIntArray)\(/); return m ? m[1] : /^[0-9a-f]{8}$/.test(v) ? 'color' : 'string'; }
  return typeof v;
}
function compareKeys(a, b, where, optional = []) {
  const ka = Object.keys(a).filter((k) => !optional.includes(k)), kb = Object.keys(b).filter((k) => !optional.includes(k));
  ok(JSON.stringify(ka) === JSON.stringify(kb), `${where}: keys differ\n   ours: ${ka}\n   real: ${kb}`);
  for (const k of ka) {
    if (k in b && !(shape(a[k]) === shape(b[k]) || shape(a[k]) === 'string' && shape(b[k]) === 'color' || shape(a[k]) === 'color' && shape(b[k]) === 'string' || shape(b[k]) === 'null' || shape(a[k]) === 'null')) {
      ok(false, `${where}.${k}: value kind ${shape(a[k])} vs real ${shape(b[k])}`);
    }
  }
}
const lv = map.world.levels['0'], rlv = ref.world.levels['0'];
compareKeys(map, ref, 'root', ['mod']);
compareKeys(map.header, ref.header, 'header');
compareKeys(map.header.creation_date, ref.header.creation_date, 'header.creation_date');
compareKeys(map.header.editor_state, ref.header.editor_state, 'editor_state');
compareKeys(map.world, ref.world, 'world');
compareKeys(lv, rlv, 'level');
for (const k of ['environment', 'tiles', 'cave', 'terrain', 'roofs', 'water', 'shapes']) { compareKeys(lv[k], rlv[k], `level.${k}`); }
compareKeys(lv.paths[0], rlv.paths[0], 'path');
compareKeys(lv.objects[0], rlv.objects[0], 'object', ['custom_color']);
ok(JSON.stringify(lv.layers) === JSON.stringify(rlv.layers), 'layers table differs from real map');

// 2. array sizes
ok(map.world.width === W && map.world.height === H, `map is ${map.world.width}x${map.world.height}, expected the encounter grid plus ${PAD} square on every side: ${W}x${H}`);
ok(poolLen(lv.tiles.cells) === W * H && lv.tiles.colors.length === W * H, 'tiles size');
ok(poolLen(lv.terrain.splat) === 16 * W * H * 4, `splat size ${poolLen(lv.terrain.splat)} != ${16 * W * H * 4}`);
const caveLen = Math.floor(2 * W * H + 1.5 * (W + H) + 2);
ok(poolLen(lv.cave.bitmap) === caveLen && poolLen(lv.cave.entrance_bitmap) === caveLen, `cave bitmap size != ${caveLen}`);
const splat = lv.terrain.splat.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number);
{
  let bad = 0; for (let i = 0; i < splat.length; i += 4) { if (splat[i] + splat[i + 1] + splat[i + 2] + splat[i + 3] !== 255) { bad++; } }
  ok(bad === 0, `${bad} splat texels do not sum to 255`);
}

// 3. every res:// path exists in the packs, and the manifest lists exactly the packs used
const { byId } = packs();
const texts = [];
(function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { Object.values(o).forEach(collect); } else if (typeof o === 'string' && o.startsWith('res://packs/')) { texts.push(o); } })(lv);
const idsUsed = new Set(texts.map((t) => t.split('/')[3]));
for (const t of new Set(texts)) { ok(byId.get(t.split('/')[3])?.entries.has(t), `missing asset ${t}`); }
const manifestIds = new Set(map.header.asset_manifest.map((m) => m.id));
for (const id of idsUsed) { ok(manifestIds.has(id), `pack ${id} used but not in manifest`); }
for (const m of map.header.asset_manifest) { ok(JSON.stringify(byId.get(m.id)?.meta) === JSON.stringify(m), `manifest entry for ${m.name} differs from pack.json`); }
ok([...manifestIds].every((id) => idsUsed.has(id)), 'manifest lists a pack that is not used');

// 4. geometry vs the encounter grid
const pathsOf = (re) => lv.paths.filter((p) => re.test(p.texture)).map((p) => { const [ox, oy] = vec(p.position); return { p, pts: pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]) }; });
const distSeg = (x, y, [ax, ay], [bx, by]) => { const l2 = (bx - ax) ** 2 + (by - ay) ** 2; const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)); return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y); };
const distPath = (x, y, pts) => Math.min(...pts.slice(1).map((q, i) => distSeg(x, y, pts[i], q)));
const cliffs = pathsOf(/_cliff\.png$/);
const stairPaths = pathsOf(/\/stairs_5[a-z]\.png$/), plankPaths = pathsOf(/planks2B\.png$/);
const at = (c, r) => cells.find((x) => x.c === c && x.r === r);
// rule 7: every height change between two squares has a cliff along its edge, unless a stair square is one of them
let edgeCount = 0, covered = 0;
for (const a of cells) {
  for (const [dc, dr] of [[1, 0], [0, 1]]) {
    const b = at(a.c + dc, a.r + dr);
    if (!b || a.elev === b.elev) { continue; }
    const isStair = a.label === STAIR || b.label === STAIR;
    // edge midpoint and the unit step toward the high side
    const mx = dc ? a.c * S : (a.c - 0.5) * S, my = dc ? (a.r - 0.5) * S : a.r * S;
    const high = a.elev > b.elev ? [-dc, -dr] : [dc, dr];
    const hit = cliffs.filter(({ pts }) => distPath(mx, my, pts) < 30);
    if (isStair) { continue; }
    edgeCount++;
    if (hit.length) { covered++; } else { ok(false, `rule 7: height change between (${a.c},${a.r}) +${a.elev} and (${b.c},${b.r}) +${b.elev} has no cliff along its edge`); continue; }
    // the cliff strip is lit from its top (left of travel on screen): that side must face the high ground
    const good = hit.some(({ pts }) => {
      const i = pts.slice(1).map((q, k) => distSeg(mx, my, pts[k], q)).reduce((bi, d, k, arr) => (d < arr[bi] ? k : bi), 0);
      const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]], len = Math.hypot(...d);
      const top = [d[1] / len, -d[0] / len];
      return top[0] * high[0] + top[1] * high[1] > 0.9;
    });
    ok(good, `rule 7: cliff at the edge of (${a.c},${a.r}) / (${b.c},${b.r}) is turned so its lit top faces the low ground`);
  }
}
ok(edgeCount > 0 && covered === edgeCount, `${covered}/${edgeCount} height-change edges have a cliff`);
// ...and every cliff runs along a real height change (sample inside its length, clear of the extended ends)
for (const { p, pts } of cliffs) {
  const a = pts[0], b = pts[pts.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let t = 100; t < len - 100; t += 150) {
    const x = a[0] + ((b[0] - a[0]) * t) / len, y = a[1] + ((b[1] - a[1]) * t) / len;
    const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    const line = Math.round((vertical ? x : y) / S) * S;
    const along = (vertical ? y : x), idx = Math.floor(along / S) + 1;
    const c1 = vertical ? Math.round(line / S) : idx, r1 = vertical ? idx : Math.round(line / S);
    const c2 = vertical ? c1 + 1 : c1, r2 = vertical ? r1 : r1 + 1;
    const A = at(c1, r1), B = at(c2, r2);
    ok(A && B && A.elev !== B.elev && Math.abs((vertical ? x : y) - line) < 25, `cliff ${p.node_id} at (${Math.round(x)}, ${Math.round(y)}) does not follow a height change`);
  }
}
// stairs and the plank crossing sit on exactly their squares
const inPath = (x, y, { p, pts }) => { const [a, b] = pts; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; const along = (x - a[0]) * d[0] + (y - a[1]) * d[1], across = -(x - a[0]) * d[1] + (y - a[1]) * d[0]; return along > 0 && along < len && Math.abs(across) < p.width / 2; };
for (const c of cells) {
  const [x, y] = centre(c);
  ok((c.label === STAIR) === stairPaths.some((sp) => inPath(x, y, sp)), `stair square mismatch at (${c.c},${c.r})`);
  ok((c.label === PLANK) === plankPaths.some((pp) => inPath(x, y, pp)), `plank square mismatch at (${c.c},${c.r})`);
}
// water: every stream / plank square is wet, no other square is
{
  const TW = W * 4;
  const wetAt = (x, y) => { const i = (Math.floor(y / 64) * TW + Math.floor(x / 64)) * 4; return splat[i + 2]; };
  for (const c of cells) {
    const [x, y] = centre(c);
    const wet = c.label === STREAM || c.label === PLANK;
    ok(wet ? wetAt(x, y) >= 100 : wetAt(x, y) <= 60, `terrain water at (${c.c},${c.r}) is ${wetAt(x, y)} for a ${c.label} square`);
  }
}
// trunks have a tree, logs lie across their squares, the thorn hollow is bramble, the cache has its gear
const objAt = (re) => lv.objects.filter((o) => re.test(o.texture)).map((o) => ({ o, p: vec(o.position) }));
const trees = objAt(/\/tree_[^/]*\.png$/);
{
  const trunkCells = cells.filter((c) => c.label === TRUNK);
  const seen = new Set();
  for (const c of trunkCells) {
    const [x, y] = centre(c);
    ok(trees.some(({ p }) => Math.hypot(p[0] - x, p[1] - y) < 330), `trunk square (${c.c},${c.r}) has no tree canopy over it`);
    seen.add(`${c.c},${c.r}`);
  }
  ok(trees.filter(({ o }) => o.layer === 700).length >= 4 + 0, 'fewer than four canopies');
  const logs = objAt(/\/log\.png$/);
  const logCells = cells.filter((c) => c.label === LOG);
  ok(logs.length === 2 && logCells.length === 4, `expected two fallen logs over four squares, found ${logs.length} / ${logCells.length}`);
  for (const c of logCells) { const [x, y] = centre(c); ok(logs.some(({ p }) => Math.hypot(p[0] - x, p[1] - y) < 300), `log square (${c.c},${c.r}) has no log`); }
  const spines = objAt(/\/spines_/);
  for (const c of cells.filter((x) => x.label === THORN)) { const [x, y] = centre(c); ok(spines.filter(({ p }) => Math.abs(p[0] - x) < S / 2 && Math.abs(p[1] - y) < S / 2).length >= 3, `thorn square (${c.c},${c.r}) is not thorny enough`); }
  const cache = cells.find((c) => c.label === CACHE), [cx, cy] = centre(cache);
  ok(lv.objects.filter((o) => { const [x, y] = vec(o.position); return Math.hypot(x - cx, y - cy) < 100 && o.layer === 400; }).length >= 3, 'the waypoint cache lacks its gear');
}

// colorable textures are drawn as raw red unless tinted with custom_color
{
  const colorable = new Set(loadRows().filter((r) => r.colorable === 'y').map((r) => `${r.pack}|${r.rel}`));
  const idToName = new Map([...byId.values()].map((p) => [p.meta.id, p.name]));
  const key = (t) => `${idToName.get(t.split('/')[3])}|${t.split('/').slice(4).join('/')}`;
  const bad = lv.objects.filter((o) => !o.custom_color && colorable.has(key(o.texture)));
  ok(bad.length === 0, `${bad.length} colorable textures placed without custom_color (they render raw red): ${bad.slice(0, 3).map((o) => o.texture.split('/').pop())}`);
}

// 5. the user's mapping rules (the dungeondraft skill)
// Rule 1 covers props; the BW shadow circles are exempt (the user sets them at 1.3 and above) and get their own range below.
const isShadow = (o) => isShadowTexture(o.texture);
const propObjects = lv.objects.filter((o) => !isShadow(o)), shadowObjects = lv.objects.filter(isShadow);
const scales = propObjects.map((o) => vec(o.scale));
ok(scales.every(([sx, sy]) => sx === sy && sx >= 0.8 - 1e-9 && sx <= 1.2 + 1e-9), `rule 1: ${scales.filter(([sx]) => sx < 0.8 || sx > 1.2).length} objects have a scale outside 0.8-1.2`);
ok(map.world.object_shadow === false && lv.objects.every((o) => o.shadow === false), 'rule 2: object shadows must be off (world.object_shadow and every object.shadow)');
{
  // rule 3: a floor against a bare map, and difficult terrain must be noticeably denser than the ordinary ground around it
  const clutter = lv.objects.filter((o) => o.layer === 300);
  ok(clutter.length >= 100, `rule 3: only ${clutter.length} ground-detail objects (the map looks bare)`);
  const wetSet = new Set(cells.filter((c) => c.label === STREAM).map((c) => `${c.c},${c.r}`));
  const dry = cells.filter((c) => !['Stream / wet undergrowth', PLANK, STAIR, TRUNK, THORN].includes(c.label));
  const inCell = (o) => { const [x, y] = vec(o.position); return `${Math.floor(x / S) + 1},${Math.floor(y / S) + 1}`; };
  const wetN = clutter.filter((o) => wetSet.has(inCell(o))).length / wetSet.size;
  const dryKeys = new Set(dry.map((c) => `${c.c},${c.r}`));
  const dryN = clutter.filter((o) => dryKeys.has(inCell(o))).length / dryKeys.size;
  ok(wetN >= 1.8 * dryN, `rule 3: difficult terrain has ${wetN.toFixed(2)} clutter per square against ${dryN.toFixed(2)} on ordinary ground (needs to be noticeably denser)`);
}
{
  // rule 4: nothing is snapped to a square centre or tilted by exactly zero
  const snapped = lv.objects.filter((o) => { const [x, y] = vec(o.position); return Math.abs(((x + S / 2) % S) - S / 2) < 0.5 && Math.abs(((y + S / 2) % S) - S / 2) < 0.5 && Math.abs(o.rotation) < 1e-3; }).length;
  ok(snapped === 0, `rule 4: ${snapped} objects sit exactly on a square centre with no rotation`);
}
ok(lv.walls.length === 0 && lv.portals.length === 0 && lv.patterns.length === 0, 'this map has no walls, portals or patterns');
ok(poolLen(lv.cave.bitmap) === caveLen && !/[1-9]/.test(lv.cave.bitmap.replace(/^Pool\w+\(/, '')) && !/[1-9]/.test(lv.cave.entrance_bitmap.replace(/^Pool\w+\(/, '')), 'rule 6: cave tool data must stay empty');
ok(lv.shapes.polygons.length === 0 && lv.shapes.walls.length === 0, 'rule 6: building tool shapes must stay empty');

// 6. nodes and bounds
const ids = [];
(function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { if (typeof o.node_id === 'string') { ids.push(o.node_id); } Object.values(o).forEach(collect); } })(lv);
ok(new Set(ids).size === ids.length, 'duplicate node_id values');
ok(parseInt(map.world.next_node_id, 16) > Math.max(...ids.map((x) => parseInt(x, 16))), 'next_node_id not beyond the largest node id');
ok(lv.objects.every((o) => { const [x, y] = vec(o.position); return x > -400 && y > -400 && x < W * S + 400 && y < H * S + 400; }), 'object far outside the map');
ok(lv.paths.every((p) => p.layer <= Math.min(...propObjects.map((o) => o.layer))), 'a path sits above an object layer and could cover objects');

// 7. BW shadows: a half shadow along every cliff falling on the low ground, a circle under every big prop, everything on the shadow layer
{
  const shadowPaths = lv.paths.filter((p) => isShadowTexture(p.texture));
  ok(shadowPaths.every((p) => p.layer === SHADOW_LAYER && /[/]BW_(Half|Full)_Shadow_(Large|Small)_(025|050|075|100)[.]png$/.test(p.texture)), 'shadow paths must be BW shadow textures on the shadow layer');
  ok(shadowObjects.every((o) => o.layer === SHADOW_LAYER && /[/]objects[/]BW_Shadow_Circle_(025|050|075|100)[.]png$/.test(o.texture)), 'shadow objects must be BW circle shadows (not colorable) on the shadow layer');
  const circleScales = shadowObjects.map((o) => vec(o.scale));
  ok(circleScales.every(([sx, sy]) => sx === sy && sx >= SHADOW_CIRCLE_SCALE - 1e-9 && sx <= 2 + 1e-9), `shadow circles must be scaled ${SHADOW_CIRCLE_SCALE}-2`);
  const shadowLines = shadowPaths.map((p) => { const [ox, oy] = vec(p.position); return pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]); });
  for (const { p, pts } of cliffs) {
    // a half shadow must follow the cliff's line but run the other way, so its fade (left of travel) lies across the low ground
    const dir = (q) => { const d = [q[q.length - 1][0] - q[0][0], q[q.length - 1][1] - q[0][1]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
    const dc = dir(pts);
    const hit = shadowLines.some((line) => line.every((q) => distPath(q[0], q[1], pts) < 60) && /_Half_/.test(shadowPaths[shadowLines.indexOf(line)].texture) && dir(line)[0] * dc[0] + dir(line)[1] * dc[1] < -0.9);
    ok(hit, `cliff ${p.node_id} has no half shadow running the opposite way along it (its fade would not fall on the low ground)`);
  }
  const big = [...trees.filter(({ o }) => o.layer === 700), ...objAt(/[/]log[.]png$/), ...objAt(/[/]firepit_/)];
  for (const { o, p } of big) {
    ok(shadowObjects.some((s) => { const [sx, sy] = vec(s.position); return Math.hypot(sx - p[0], sy - p[1]) < 60; }), `big prop ${o.texture.split('/').pop()} at (${Math.round(p[0])}, ${Math.round(p[1])}) has no circle shadow`);
  }
}
console.log(`${passes} checks passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
