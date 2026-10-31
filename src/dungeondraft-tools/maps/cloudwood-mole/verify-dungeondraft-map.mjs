// Independent checks for the generated Cloudwood mole map (we cannot launch Dungeondraft from here): structure against a real map
// of the same build, asset paths, array sizes, geometry against the encounter grid (re-derived here from the HTML on purpose, not
// from structure.mjs, so a mistake in the structure shows up as a mismatch) and the user's mapping rules. The checks every map
// shares live in lib/map-checks.mjs.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REFERENCE_MAP, REPO_DIR } from '../../config.mjs';
import { cliArg, cliMapPath } from '../../lib/cli.mjs';
import { SHADOW_LAYER } from '../../lib/shadows.mjs';
import { checkArraySizes, checkAssets, checkColorable, checkMappingRules, checkNodes, checkShadowTextures, checkStructure, createChecker, loadMap, mapFileIn, pool, splitObjects, vec } from '../../lib/map-checks.mjs';

const ENCOUNTER = 'cloudwood-mole';
const S = 256, BASE_COLS = 18, BASE_ROWS = 14, PAD = 1;
const MAP = cliMapPath(mapFileIn(MAPS_OUT_DIR, ENCOUNTER));
const REF = cliArg('--ref', REFERENCE_MAP);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'encounters', `${ENCOUNTER}.html`));
const map = loadMap(MAP);
const ref = loadMap(REF);
const { ok, finish } = createChecker();

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

const lv = map.world.levels['0'];

// 1. structure vs a real map made by the same Dungeondraft build
checkStructure(ok, map, ref);

// 2. array sizes
ok(map.world.width === W && map.world.height === H, `map is ${map.world.width}x${map.world.height}, expected the encounter grid plus ${PAD} square on every side: ${W}x${H}`);
const { caveLen, splat } = checkArraySizes(ok, map);

// 3. every res:// path exists in the packs, and the manifest lists exactly the packs used
checkAssets(ok, map);

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

checkColorable(ok, map);

// 5. the user's mapping rules (the dungeondraft skill): 1, 2, 4 and 6 are shared, 3 is checked here
// Rule 1 covers props; the BW shadow circles are exempt (the user sets them at 1.3 and above) and get their own range below.
const { propObjects, shadowObjects } = splitObjects(lv);
checkMappingRules(ok, map, { S, caveLen });
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
ok(lv.walls.length === 0 && lv.portals.length === 0 && lv.patterns.length === 0, 'this map has no walls, portals or patterns');

// 6. nodes and bounds
checkNodes(ok, map, { S, margin: 400 });
ok(lv.paths.every((p) => p.layer <= Math.min(...propObjects.map((o) => o.layer))), 'a path sits above an object layer and could cover objects');

// 7. BW shadows: a half shadow along every cliff falling on the low ground, a circle under every big prop, everything on the shadow layer
{
  const { shadowPaths } = checkShadowTextures(ok, map, { pathLayer: SHADOW_LAYER, onlyShadowPaths: false });
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
finish();
