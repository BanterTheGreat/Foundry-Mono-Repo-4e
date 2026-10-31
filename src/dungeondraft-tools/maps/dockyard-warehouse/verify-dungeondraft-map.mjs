// Independent checks for the generated Dungeondraft map (we cannot launch Dungeondraft from here): structure against a real
// map of the same build, asset paths, array sizes, geometry against the encounter grid, and the user's mapping rules.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, MAPS_OUT_DIR, REFERENCE_MAP } from '../../config.mjs';
import { locateOnPolyline, pointInPolygon } from '../../lib/geometry.mjs';
import { loadRows } from '../../lib/lib.mjs';
import { packs } from '../../lib/packs.mjs';
import { COLS, LABEL, ROWS, S, parseGrid } from './grid.mjs';

const ENCOUNTER = 'dockyard-warehouse';
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const MAP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(MAPS_OUT_DIR, ENCOUNTER, `${ENCOUNTER}-v2.dungeondraft_map`);
const REF = arg('--ref', REFERENCE_MAP);
const HTML = arg('--html', path.join(ARTIFACTS_DIR, `${ENCOUNTER}.html`));
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const grid = parseGrid(fs.readFileSync(HTML, 'utf8'));
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('FAIL:', msg); } };
const vec = (s) => s.replace('Vector2', '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };
const poolLen = (s) => s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').length;

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
const refWall = rlv.walls.find((w) => w.portals.length);
compareKeys(lv.walls[0], refWall, 'wall');
compareKeys(lv.walls[0].portals[0], refWall.portals[0], 'portal');
compareKeys(lv.patterns[0], rlv.patterns[0], 'pattern');
compareKeys(lv.objects[0], rlv.objects[0], 'object', ['custom_color']);
ok(JSON.stringify(lv.layers) === JSON.stringify(rlv.layers), 'layers table differs from real map');

// 2. array sizes
const W = map.world.width, H = map.world.height;
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
const { ring } = grid;
const rect = (c1, r1, c2, r2) => [[(c1 - 1) * S, (r1 - 1) * S], [c2 * S, (r1 - 1) * S], [c2 * S, r2 * S], [(c1 - 1) * S, r2 * S]];
const expectedOuter = rect(ring.c1, ring.r1, ring.c2, ring.r2);
// rule 5: the wall squares get ONE wall, on their outer edge. No wall may run along the band's inner edge.
ok(lv.walls.length === 1, `expected a single wall loop on the wall squares' outer edge, found ${lv.walls.length} walls`);
const loops = lv.walls.map((w) => ({ w, P: pool(w.points) }));
const sameLoop = (P, E) => P.length === E.length && P.every((p, i) => Math.abs(p[0] - E[i][0]) < 0.5 && Math.abs(p[1] - E[i][1]) < 0.5);
const outer = loops.find((l) => sameLoop(l.P, expectedOuter));
ok(outer, 'the wall is not the ring\'s outer edge');
ok(loops.every(({ w }) => w.loop === true && w.joint === 0), 'wall loops must be closed with sharp joints');
const doorCells = grid.doorCells;
ok(doorCells.length > 0 && lv.walls.every((w) => w.portals.length === doorCells.length), `the wall needs ${doorCells.length} openings`);
for (const [c, r] of doorCells) {
  const cx = (c - 0.5) * S, cy = (r - 0.5) * S;
  const east = c === ring.c2, west = c === ring.c1, north = r === ring.r1;
  const E = expectedOuter;
  const want = west ? [E[0][0], cy] : east ? [E[1][0], cy] : north ? [cx, E[0][1]] : [cx, E[2][1]];
  ok(!!outer && outer.w.portals.some((p) => { const [px, py] = vec(p.position); return Math.hypot(px - want[0], py - want[1]) < 1; }), `no opening at (${want}) for door (${c},${r})`);
}
for (const { w, P } of loops) {
  for (const p of w.portals) {
    const [px, py] = vec(p.position);
    const at = locateOnPolyline(P, w.loop, px, py);
    ok(at && at.dist < 0.5 && p.point_index === at.index && Math.abs(p.wall_distance - (at.index + at.t)) < 1e-4, `portal ${p.node_id}: wall_distance ${p.wall_distance} vs segment ${at?.index} + ${at?.t}`);
    ok(Math.abs(p.rotation - Math.atan2(at.direction[1], at.direction[0])) < 1e-4, `portal ${p.node_id} rotation`);
    ok(p.wall_id === w.node_id && p.closed === false, `portal ${p.node_id}: wall_id / open state`);
  }
}
// every square of the ring and the room is covered exactly once by the masonry and floor patterns (layer -100), and the
// paving (layer -400) covers all land squares and none of the water
const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];
const polys = (layer, nameRe) => lv.patterns.filter((p) => p.layer === layer && nameRe.test(p.texture)).map((p) => pool(p.points));
const masonry = polys(-100, /Stone_Sidewalk/i), floors = polys(-100, /planks_1b/i);
const doorKey = new Set(doorCells.map(([c, r]) => `${c},${r}`));
for (let c = ring.c1; c <= ring.c2; c++) {
  for (let r = ring.r1; r <= ring.r2; r++) {
    const pt = centre(c, r);
    const isRing = c === ring.c1 || c === ring.c2 || r === ring.r1 || r === ring.r2;
    const m = masonry.filter((poly) => pointInPolygon(pt, poly)).length, f = floors.filter((poly) => pointInPolygon(pt, poly)).length;
    const wantMasonry = isRing && !doorKey.has(`${c},${r}`);
    ok(m === (wantMasonry ? 1 : 0) && f === (wantMasonry ? 0 : 1), `square (${c},${r}): masonry x${m}, floor x${f}`);
  }
}
{
  const paving = polys(-400, /brick_street_1a/i);
  let bad = 0;
  for (let c = 1; c <= COLS; c++) { for (let r = 1; r <= ROWS; r++) { const land = grid.type[`${c},${r}`] !== LABEL.WATER; if (paving.some((poly) => pointInPolygon(centre(c, r), poly)) !== land) { bad++; } } }
  ok(bad === 0, `${bad} squares where paving and land disagree`);
}
{
  const TW = W * 4; let bad = 0;
  for (let ty = 0; ty < H * 4; ty++) { for (let tx = 0; tx < TW; tx++) { const i = (ty * TW + tx) * 4; const x = tx * 64 + 32; const wet = grid.type[`${Math.floor(x / S) + 1},${Math.floor((ty * 64 + 32) / S) + 1}`] === LABEL.WATER; if (wet !== (splat[i] + splat[i + 1] > 0)) { bad++; } } }
  ok(bad === 0, `${bad} terrain texels disagree with the water squares`);
}
// layering: every pattern sits at or below the lowest object layer, so patterns never cover objects
{
  const topPattern = Math.max(...lv.patterns.map((p) => p.layer)), lowObject = Math.min(...lv.objects.map((o) => o.layer));
  ok(topPattern <= lowObject, `a pattern on layer ${topPattern} could cover objects on layer ${lowObject}`);
}

// colorable textures are drawn as raw red unless tinted with custom_color
{
  const colorable = new Set(loadRows().filter((r) => r.colorable === 'y').map((r) => `${r.pack}|${r.rel}`));
  const idToName = new Map([...byId.values()].map((p) => [p.meta.id, p.name]));
  const bad = lv.objects.filter((o) => !o.custom_color && colorable.has(`${idToName.get(o.texture.split('/')[3])}|${o.texture.split('/').slice(4).join('/')}`));
  ok(bad.length === 0, `${bad.length} colorable textures placed without custom_color (they render raw red): ${bad.slice(0, 3).map((o) => o.texture.split('/').pop())}`);
}

// 5. the user's mapping rules (the dungeondraft skill)
const scales = lv.objects.map((o) => vec(o.scale));
ok(scales.every(([sx, sy]) => sx === sy && sx >= 0.8 - 1e-9 && sx <= 1.2 + 1e-9), `rule 1: ${scales.filter(([sx]) => sx < 0.8 || sx > 1.2).length} objects have a scale outside 0.8-1.2`);
ok(map.world.object_shadow === false && lv.objects.every((o) => o.shadow === false), 'rule 2: object shadows must be off (world.object_shadow and every object.shadow)');
{
  // A floor against a bare map only (about a quarter of an object per land square). The density itself is set by the
  // generator's CLUTTER_CUTS, so a further cut must not trip this check.
  const clutter = lv.objects.filter((o) => o.layer === 100).length;
  ok(clutter >= 60, `rule 3: only ${clutter} small ground-detail objects (the map looks bare)`);
}
{
  // rule 4: nothing is snapped to a square centre or tilted by exactly zero
  const snapped = lv.objects.filter((o) => { const [x, y] = vec(o.position); return Math.abs(((x + S / 2) % S) - S / 2 + 0) < 0.5 && Math.abs(((y + S / 2) % S) - S / 2) < 0.5 && Math.abs(o.rotation) < 1e-3; }).length;
  ok(snapped === 0, `rule 4: ${snapped} objects sit exactly on a square centre with no rotation`);
}
for (const { w, P } of loops) {
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length];
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    const onLine = (v) => Math.abs(v / S - Math.round(v / S)) < 0.5 / S;
    ok((horizontal && onLine(a[1])) || (vertical && onLine(a[0])), `rule 5: wall ${w.node_id} segment ${i} (${a} to ${b}) is not on a square edge`);
  });
}
ok(poolLen(lv.cave.bitmap) === caveLen && !/[1-9]/.test(lv.cave.bitmap.replace(/^Pool\w+\(/, '')) && !/[1-9]/.test(lv.cave.entrance_bitmap.replace(/^Pool\w+\(/, '')), 'rule 6: cave tool data must stay empty');
ok(lv.shapes.polygons.length === 0 && lv.shapes.walls.length === 0, 'rule 6: building tool shapes must stay empty');

// 6. nodes
const ids = [];
(function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { if (typeof o.node_id === 'string') { ids.push(o.node_id); } Object.values(o).forEach(collect); } })(lv);
ok(new Set(ids).size === ids.length, 'duplicate node_id values');
ok(parseInt(map.world.next_node_id, 16) > Math.max(...ids.map((x) => parseInt(x, 16))), 'next_node_id not beyond the largest node id');
ok(lv.objects.every((o) => { const [x, y] = vec(o.position); return x > -300 && y > -300 && x < W * S + 300 && y < H * S + 300; }), 'object far outside the map');
console.log(`${passes} checks passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
