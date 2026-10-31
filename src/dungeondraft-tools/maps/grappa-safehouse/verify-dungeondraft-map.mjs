// Independent checks for the generated Grappa safehouse map (we cannot launch Dungeondraft from here): structure against a real
// map of the same build, asset paths, array sizes, geometry against the encounter grid (re-derived here from the JSON on purpose,
// not from structure.mjs, so a mistake in the structure shows up as a mismatch) and the user's mapping rules.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--json encounter.json]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REFERENCE_MAP, REPO_DIR } from '../../config.mjs';
import { locateOnPolyline, pointInPolygon } from '../../lib/geometry.mjs';
import { loadRows } from '../../lib/lib.mjs';
import { packs } from '../../lib/packs.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, isShadowTexture } from '../../lib/shadows.mjs';

const ENCOUNTER = 'grappa-safehouse';
const S = 256, BASE_COLS = 16, BASE_ROWS = 14, W = 19, H = 16; // the 16 x 14 encounter plus 3 street columns east and 2 corridor rows south
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const MAP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(MAPS_OUT_DIR, ENCOUNTER, `${ENCOUNTER}.dungeondraft_map`);
const REF = arg('--ref', REFERENCE_MAP);
const JSON_FILE = arg('--json', path.join(REPO_DIR, 'output', 'maps', `${ENCOUNTER}.json`));
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const enc = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('FAIL:', msg); } };
const vec = (s) => s.replace('Vector2', '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };
const poolLen = (s) => s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').length;

// The encounter, read again here from its JSON: the lists of wall, door, bench, machine and scrap squares; the border is the ring.
const listed = (name) => new Set((enc.terrain[name] ?? []).map(([c, r]) => `${c},${r}`));
const doors = listed('door'), wallList = listed('wall'), benches = listed('bench'), machines = listed('machine'), scraps = listed('scrap');
ok(enc.columns === BASE_COLS && enc.rows === BASE_ROWS, `encounter is ${enc.columns} x ${enc.rows}`);
const kindOf = (c, r) => {
  const k = `${c},${r}`;
  if (c < 1 || r < 1) { return 'outside'; }
  if (c > BASE_COLS) { return 'street'; }
  if (r > BASE_ROWS) { return 'corridor'; }
  if (doors.has(k)) { return 'door'; }
  if (c === 1 || c === BASE_COLS || r === 1 || r === BASE_ROWS || wallList.has(k)) { return 'wall'; }
  return benches.has(k) ? 'bench' : machines.has(k) ? 'machine' : scraps.has(k) ? 'scrap' : 'floor';
};
const roomOf = (c, r) => (r >= 2 && r <= 7 && c >= 2 && c <= 9 ? 'records' : r >= 2 && r <= 7 && c >= 11 && c <= 15 ? 'store' : r >= 9 && r <= 13 && c >= 2 && c <= 15 ? 'common' : null);
const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];

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
for (const w of lv.walls) { compareKeys(w, refWall, `wall ${w.node_id}`); }
compareKeys(lv.walls[0].portals[0], refWall.portals[0], 'portal');
compareKeys(lv.patterns[0], rlv.patterns[0], 'pattern');
compareKeys(lv.paths[0], rlv.paths.find(Boolean) ?? JSON.parse(fs.readFileSync(path.join(MAPS_OUT_DIR, 'cloudwood-mole', 'cloudwood-mole.dungeondraft_map'), 'utf8')).world.levels['0'].paths[0], 'path');
compareKeys(lv.objects[0], rlv.objects[0], 'object', ['custom_color']);
ok(JSON.stringify(lv.layers) === JSON.stringify(rlv.layers), 'layers table differs from real map');

// 2. array sizes
ok(map.world.width === W && map.world.height === H, `map is ${map.world.width}x${map.world.height}, expected ${W}x${H} (the encounter plus 3 street columns and 2 corridor rows)`);
ok(poolLen(lv.tiles.cells) === W * H && lv.tiles.colors.length === W * H, 'tiles size');
ok(poolLen(lv.terrain.splat) === 16 * W * H * 4, `splat size ${poolLen(lv.terrain.splat)} != ${16 * W * H * 4}`);
const caveLen = Math.floor(2 * W * H + 1.5 * (W + H) + 2);
ok(poolLen(lv.cave.bitmap) === caveLen && poolLen(lv.cave.entrance_bitmap) === caveLen, `cave bitmap size != ${caveLen}`);
{
  const splat = lv.terrain.splat.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number);
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

// 4. walls (rule 5): the ring on its outer edge, one partition each way, the corridor's neighbours
const wallPts = lv.walls.map((w) => ({ w, P: pool(w.points) }));
ok(lv.walls.length === 4, `expected 4 walls (ring, two partitions, corridor), found ${lv.walls.length}`);
const samePts = (P, E) => P.length === E.length && P.every((p, i) => Math.abs(p[0] - E[i][0]) < 0.5 && Math.abs(p[1] - E[i][1]) < 0.5);
const ring = wallPts.find(({ P }) => samePts(P, [[0, 0], [BASE_COLS * S, 0], [BASE_COLS * S, BASE_ROWS * S], [0, BASE_ROWS * S]]));
ok(ring && ring.w.loop === true, 'the ring is not one clockwise loop on the outer edge of the border squares');
// a horizontal partition is a row of listed wall squares across the building; its line is the row's SOUTH edge. A vertical one
// is a column of them from the north ring; its line is the column's EAST edge.
const hRows = [];
for (let r = 2; r < BASE_ROWS; r++) { let all = true; for (let c = 2; c < BASE_COLS; c++) { all &&= ['wall', 'door'].includes(kindOf(c, r)); } if (all) { hRows.push(r); } }
const vCols = [];
for (let c = 2; c < BASE_COLS; c++) { if (['wall', 'door'].includes(kindOf(c, 2))) { vCols.push(c); } }
ok(hRows.length === 1 && vCols.length === 1, `expected one partition each way, found rows ${hRows} and columns ${vCols}`);
const rowLine = [[BASE_COLS * S, hRows[0] * S], [0, hRows[0] * S]];
const colLine = [[vCols[0] * S, 0], [vCols[0] * S, hRows[0] * S]];
const hWall = wallPts.find(({ P }) => samePts(P, rowLine)), vWall = wallPts.find(({ P }) => samePts(P, colLine));
ok(hWall && !hWall.w.loop, `the horizontal partition is not one line on the south edge of row ${hRows[0]}, running west`);
ok(vWall && !vWall.w.loop, `the vertical partition is not one line on the east edge of column ${vCols[0]}, running south`);
const neighbour = wallPts.find(({ P }) => samePts(P, [[0, BASE_ROWS * S], [0, H * S], [BASE_COLS * S, H * S]]));
ok(neighbour && !neighbour.w.loop, 'the corridor wall is not the west end then the south side of the corridor');
ok(wallPts.every(({ w }) => w.joint === 0), 'walls must have sharp joints');
for (const { w, P } of wallPts) {
  const count = w.loop ? P.length : P.length - 1;
  for (let i = 0; i < count; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    const onLine = (v) => Math.abs(v / S - Math.round(v / S)) < 0.5 / S;
    ok((horizontal && onLine(a[1])) || (vertical && onLine(a[0])), `rule 5: wall ${w.node_id} segment ${i} (${a} to ${b}) is not on a square edge`);
  }
}
// every doorway square is an opening on the wall that bounds it, and there are no others
const expectedOpenings = [];
for (let r = 1; r <= BASE_ROWS; r++) {
  for (let c = 1; c <= BASE_COLS; c++) {
    if (kindOf(c, r) !== 'door') { continue; }
    const [cx, cy] = centre(c, r);
    if (c === 1) { expectedOpenings.push([ring, 0, cy]); } else if (c === BASE_COLS) { expectedOpenings.push([ring, BASE_COLS * S, cy]); }
    else if (r === 1) { expectedOpenings.push([ring, cx, 0]); } else if (r === BASE_ROWS) { expectedOpenings.push([ring, cx, BASE_ROWS * S]); }
    else if (r === hRows[0]) { expectedOpenings.push([hWall, cx, r * S]); } else if (c === vCols[0]) { expectedOpenings.push([vWall, c * S, cy]); }
    else { ok(false, `door (${c},${r}) is not on any wall`); }
  }
}
for (const [owner, x, y] of expectedOpenings) {
  ok(!!owner && owner.w.portals.some((p) => { const [px, py] = vec(p.position); return Math.hypot(px - x, py - y) < 1; }), `no opening at (${x}, ${y})`);
}
ok(lv.walls.reduce((n, w) => n + w.portals.length, 0) === expectedOpenings.length && expectedOpenings.length === 15, 'the walls must carry exactly the 15 doorway openings');
for (const { w, P } of wallPts) {
  for (const p of w.portals) {
    const [px, py] = vec(p.position);
    const at = locateOnPolyline(P, w.loop, px, py);
    ok(at && at.dist < 0.5 && p.point_index === at.index && Math.abs(p.wall_distance - (at.index + at.t)) < 1e-4, `portal ${p.node_id}: wall_distance ${p.wall_distance} vs segment ${at?.index} + ${at?.t}`);
    ok(Math.abs(p.rotation - Math.atan2(at.direction[1], at.direction[0])) < 1e-4, `portal ${p.node_id} rotation`);
    ok(p.wall_id === w.node_id && p.closed === false, `portal ${p.node_id}: wall_id / open state`);
  }
}

// every square of the map is covered exactly once by a base pattern (layer -400), with the right surface for its kind
{
  const base = lv.patterns.filter((p) => p.layer === -400).map((p) => ({ tex: p.texture.split('/').pop().replace('.png', ''), poly: pool(p.points) }));
  const FLOOR = { records: 'planks_1b', store: 'Stone_Tiled_Medium', common: 'tiles_street_1a' };
  let bad = 0;
  for (let r = 1; r <= H; r++) {
    for (let c = 1; c <= W; c++) {
      const kind = kindOf(c, r), pt = centre(c, r);
      const hit = base.filter((b) => pointInPolygon(pt, b.poly));
      const want = kind === 'wall' ? 'bricks_street_2c' : kind === 'door' ? 'planks_1b' : kind === 'corridor' ? 'bricks_street_2b'
        : kind === 'street' ? (c === 17 ? 'Stone_Sidewalk' : 'cobbles_1c') : FLOOR[roomOf(c, r)];
      if (hit.length !== 1 || hit[0].tex !== want) { bad++; console.log(`  square (${c},${r}) ${kind}: ${hit.map((h) => h.tex)} (wanted ${want})`); }
    }
  }
  ok(bad === 0, `${bad} squares have the wrong base surface`);
}
// layering: every pattern sits at or below the lowest prop layer (the BW shadows below everything are not props), so patterns never cover props
const isShadow = (o) => isShadowTexture(o.texture);
const propObjects = lv.objects.filter((o) => !isShadow(o)), shadowObjects = lv.objects.filter(isShadow);
{
  const topPattern = Math.max(...lv.patterns.map((p) => p.layer)), lowProp = Math.min(...propObjects.map((o) => o.layer));
  ok(topPattern <= lowProp, `a pattern on layer ${topPattern} could cover props on layer ${lowProp}`);
  // the user's shadow-path rule: shadow paths sit on layer 400, below the walls and above every prop, and no prop shares that layer
  ok(lv.paths.every((p) => p.layer === 400), 'shadow paths belong on layer 400 (below walls, above the props they fall on)');
  ok(propObjects.every((o) => o.layer < 400 || o.layer >= 700), 'no prop may sit on the shadow-path layer 400: only above-wall props (700+) may be higher');
  // patterns on one layer never overlap each other (square centres are covered once above; sample the worn blobs against the base too)
  const sameLayer = (layer) => lv.patterns.filter((p) => p.layer === layer);
  for (const layer of [-100, 100]) {
    const group = sameLayer(layer);
    let overlaps = 0;
    for (let i = 0; i < group.length; i++) { for (let j = i + 1; j < group.length; j++) { const A = pool(group[i].points), B = pool(group[j].points); if (A.some((p) => pointInPolygon(p, B)) || B.some((p) => pointInPolygon(p, A))) { overlaps++; } } }
    // the broken paving (layer 100) sits over the dirt blob of the same outline on layer -100, so only same-layer pairs matter here
    ok(overlaps === 0, `${overlaps} overlapping patterns share layer ${layer}`);
  }
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
const scales = propObjects.map((o) => vec(o.scale));
ok(scales.every(([sx, sy]) => sx === sy && sx >= 0.8 - 1e-9 && sx <= 1.2 + 1e-9), `rule 1: ${scales.filter(([sx]) => sx < 0.8 || sx > 1.2).length} objects have a scale outside 0.8-1.2`);
ok(map.world.object_shadow === false && lv.objects.every((o) => o.shadow === false), 'rule 2: object shadows must be off (world.object_shadow and every object.shadow)');
const squareOf = (o) => { const [x, y] = vec(o.position); return `${Math.floor(x / S) + 1},${Math.floor(y / S) + 1}`; };
{
  // rule 3: a floor against a bare map (the density itself is set by the generator's CLUTTER_CUTS), and difficult terrain must be
  // noticeably denser than the ordinary indoor ground around it
  const clutter = lv.objects.filter((o) => o.layer === 100);
  ok(clutter.length >= 100, `rule 3: only ${clutter.length} ground-detail objects (the map looks bare)`);
  const scrapKeys = new Set(scraps), ordinary = [];
  for (let r = 2; r < BASE_ROWS; r++) { for (let c = 2; c < BASE_COLS; c++) { if (kindOf(c, r) === 'floor') { ordinary.push(`${c},${r}`); } } }
  const ordinarySet = new Set(ordinary);
  const scrapN = clutter.filter((o) => scrapKeys.has(squareOf(o))).length / scrapKeys.size;
  const ordN = clutter.filter((o) => ordinarySet.has(squareOf(o))).length / ordinarySet.size;
  ok(scrapN >= 1.8 * ordN, `rule 3: difficult terrain has ${scrapN.toFixed(2)} clutter per square against ${ordN.toFixed(2)} on ordinary floor (needs to be noticeably denser)`);
  // the street and corridor are open ground with their own detail
  const outdoor = clutter.filter((o) => { const [x, y] = vec(o.position); return x > BASE_COLS * S || y > BASE_ROWS * S; }).length;
  ok(outdoor >= 40, `rule 3: only ${outdoor} ground-detail objects on the street and corridor`);
}
{
  // rule 4: nothing is snapped to a square centre or tilted by exactly zero
  const snapped = lv.objects.filter((o) => { const [x, y] = vec(o.position); return Math.abs(((x + S / 2) % S) - S / 2) < 0.5 && Math.abs(((y + S / 2) % S) - S / 2) < 0.5 && Math.abs(o.rotation) < 1e-3; }).length;
  ok(snapped === 0, `rule 4: ${snapped} objects sit exactly on a square centre with no rotation`);
}
ok(poolLen(lv.cave.bitmap) === caveLen && !/[1-9]/.test(lv.cave.bitmap.replace(/^Pool\w+\(/, '')) && !/[1-9]/.test(lv.cave.entrance_bitmap.replace(/^Pool\w+\(/, '')), 'rule 6: cave tool data must stay empty');
ok(lv.shapes.polygons.length === 0 && lv.shapes.walls.length === 0, 'rule 6: building tool shapes must stay empty');

// the grid's cover and difficult squares carry props (craft rule 5: a square that carries a rule keeps its props near its centre)
{
  for (const k of [...machines, ...benches]) {
    const [c, r] = k.split(',').map(Number), [x, y] = centre(c, r);
    ok(propObjects.some((o) => { const [ox, oy] = vec(o.position); return [200, 300, 400].includes(o.layer) && Math.hypot(ox - x, oy - y) < 190; }), `cover square (${c},${r}) has no furniture or crates on it`);
  }
  for (const k of scraps) {
    const [c, r] = k.split(',').map(Number);
    ok(lv.objects.filter((o) => o.layer === 100 && squareOf(o) === k).length >= 3, `difficult square (${c},${r}) is not cluttered enough`);
  }
}
// the new squares: the wagon at the back door, gas lamps along the kerb, the trough, and the corridor's vent
{
  const objAt = (re) => lv.objects.filter((o) => re.test(o.texture)).map((o) => ({ o, p: vec(o.position) }));
  const wagon = objAt(/\/caravan_3a\.png$/);
  ok(wagon.length === 1 && wagon[0].p[0] > BASE_COLS * S && wagon[0].p[0] < 19 * S && wagon[0].p[1] > 2 * S && wagon[0].p[1] < 6 * S, 'the wagon should wait in the street beside the rear doorway (rows 3-5)');
  ok(objAt(/\/lamp_1[abc]\.png$/).length >= 3 && objAt(/\/lamp_1[abc]\.png$/).every(({ p }) => p[0] > BASE_COLS * S && p[0] < 19 * S), 'gas lamps belong along the street');
  ok(objAt(/\/trough_1a\.png$/).length === 1, 'a water trough on the street');
  ok(objAt(/\/Lantern_Wall_0[12]\.png$/).filter(({ p }) => p[1] > BASE_ROWS * S).length >= 5, 'wall lanterns light the corridor');
  const doorsSouth = [7, 8, 9, 10].map((c) => centre(c, BASE_ROWS)[0]);
  ok(objAt(/\/Lantern_Wall_0[12]\.png$/).filter(({ p }) => p[1] > BASE_ROWS * S && p[1] < BASE_ROWS * S + 200 && (p[0] < doorsSouth[0] - 128 + 5 || p[0] > doorsSouth[3] + 128 - 5)).length >= 2, 'lamps flank the front doors');
  // nothing blocks the front doors: the squares just outside them are clear of furniture-layer props
  const blockers = lv.objects.filter((o) => o.layer >= 200 && o.layer < 700 && !isShadow(o)).filter((o) => { const [x, y] = vec(o.position); return x > 6 * S + 20 && x < 10 * S - 20 && y > BASE_ROWS * S && y < BASE_ROWS * S + S; });
  ok(blockers.length === 0, `${blockers.length} props block the corridor in front of the front doors`);
  // and no tall prop sits in the rear doorway or just outside it, except the wagon's own footprint beyond one square
  const rear = lv.objects.filter((o) => o.layer >= 200 && o.layer < 700 && !isShadow(o)).filter((o) => { const [x, y] = vec(o.position); return x > BASE_COLS * S - 60 && x < BASE_COLS * S + 100 && y > 2 * S + 20 && y < 4 * S - 20; });
  ok(rear.length === 0, `${rear.length} props block the rear doorway`);
}

// 6. nodes and bounds
const ids = [];
(function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { if (typeof o.node_id === 'string') { ids.push(o.node_id); } Object.values(o).forEach(collect); } })(lv);
ok(new Set(ids).size === ids.length, 'duplicate node_id values');
ok(parseInt(map.world.next_node_id, 16) > Math.max(...ids.map((x) => parseInt(x, 16))), 'next_node_id not beyond the largest node id');
ok(lv.objects.every((o) => { const [x, y] = vec(o.position); return x > -300 && y > -300 && x < W * S + 300 && y < H * S + 300; }), 'object far outside the map');

// 7. BW shadows: a half shadow (path, layer 400) along every standing stretch of every wall falling on the open side, a contact
// shadow where the wall mass meets the floor, and a circle (object, shadow layer) under the big props
{
  const shadowPaths = lv.paths.filter((p) => isShadowTexture(p.texture));
  ok(shadowPaths.length === lv.paths.length, 'every path on this map is a BW shadow');
  ok(shadowPaths.every((p) => p.layer === 400 && /[/]BW_(Half|Full)_Shadow_(Large|Small)_(025|050|075|100)[.]png$/.test(p.texture)), 'shadow paths must be BW shadow textures on layer 400');
  ok(shadowObjects.every((o) => o.layer === SHADOW_LAYER && /[/]objects[/]BW_Shadow_Circle_(025|050|075|100)[.]png$/.test(o.texture)), 'shadow circles must be BW circle shadows (not colorable) on the shadow layer, under every prop');
  const circleScales = shadowObjects.map((o) => vec(o.scale));
  ok(circleScales.every(([sx, sy]) => sx === sy && sx >= SHADOW_CIRCLE_SCALE - 1e-9 && sx <= 2 + 1e-9), `shadow circles must be scaled ${SHADOW_CIRCLE_SCALE}-2`);
  const lines = shadowPaths.map((p) => { const [ox, oy] = vec(p.position); const P = pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]); return { p, a: P[0], b: P[P.length - 1] }; });
  // does a shadow of the given kind cover (x, y) along its length, fading towards the unit normal (nx, ny)?
  const shadowAt = (x, y, nx, ny, re) => lines.some(({ p, a, b }) => {
    if (!re.test(p.texture) || !/_Half_/.test(p.texture)) { return false; }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const along = (x - a[0]) * d[0] + (y - a[1]) * d[1], across = -(x - a[0]) * d[1] + (y - a[1]) * d[0];
    const left = [d[1], -d[0]]; // fades to the left of travel on screen
    return along > -1 && along < len + 1 && Math.abs(across) < 2 && left[0] * nx + left[1] * ny > 0.99;
  });
  // the open side of each wall: the outside of the ring, south of the horizontal partition, east of the vertical one, into the corridor
  const checkWall = (wall, normalAt, re, label) => {
    const P = pool(wall.w.points), count = wall.w.loop ? P.length : P.length - 1;
    for (let i = 0; i < count; i++) {
      const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (let t = 40; t < len; t += 128) {
        const x = a[0] + d[0] * t, y = a[1] + d[1] * t;
        if (wall.w.portals.some((p) => { const [px, py] = vec(p.position); return Math.hypot(px - x, py - y) < S / 2 + 10; })) { continue; } // doorways are open: no shadow across them
        const [nx, ny] = normalAt(a, b, d);
        ok(shadowAt(x, y, nx, ny, re), `${label}: no half shadow at (${Math.round(x)}, ${Math.round(y)}) falling on the open side`);
      }
    }
  };
  const outward = (a, b, d) => { const n = [d[1], -d[0]]; const mx = (a[0] + b[0]) / 2 + n[0] * 50, my = (a[1] + b[1]) / 2 + n[1] * 50; return mx > 0 && mx < BASE_COLS * S && my > 0 && my < BASE_ROWS * S ? [-n[0], -n[1]] : n; };
  checkWall(ring, outward, /Large_075/, 'ring');
  checkWall(hWall, () => [0, 1], /Large_050/, 'horizontal partition');
  checkWall(vWall, () => [1, 0], /Large_050/, 'vertical partition');
  checkWall(neighbour, (a, b, d) => (d[0] === 0 ? [1, 0] : [0, -1]), /Large_050/, 'corridor wall');
  // contact shadows: every floor square edge that meets wall mass (not a doorway) has a small half shadow falling onto the floor
  let massEdges = 0;
  for (let r = 1; r <= BASE_ROWS; r++) {
    for (let c = 1; c <= BASE_COLS; c++) {
      if (kindOf(c, r) !== 'wall') { continue; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = kindOf(c + dc, r + dr);
        if (!['floor', 'bench', 'machine', 'scrap', 'door'].includes(k)) { continue; }
        massEdges++;
        const [cx, cy] = centre(c, r);
        ok(shadowAt(cx + dc * S / 2 - dr * 60, cy + dr * S / 2 + dc * 60, dc, dr, /Small_050/) || shadowAt(cx + dc * S / 2 + dr * 60, cy + dr * S / 2 - dc * 60, dc, dr, /Small_050/), `no contact shadow where wall mass (${c},${r}) meets the floor towards (${c + dc},${r + dr})`);
      }
    }
  }
  ok(massEdges > 60, `only ${massEdges} wall-mass edges found`);
  // circles under the wagon and the crate stack
  const circleAt = (x, y, tol) => shadowObjects.some((s) => { const [sx, sy] = vec(s.position); return Math.hypot(sx - x, sy - y) < tol; });
  const wagon = lv.objects.find((o) => /\/caravan_3a\.png$/.test(o.texture));
  ok(wagon && circleAt(...vec(wagon.position), 60), 'the wagon has no circle shadow');
  const stack = [...machines].map((k) => k.split(',').map(Number)).filter(([c]) => c >= 11);
  ok(stack.length === 4 && circleAt((Math.min(...stack.map(([c]) => c)) - 1 + Math.max(...stack.map(([c]) => c))) / 2 * S, (Math.min(...stack.map(([, r]) => r)) - 1 + Math.max(...stack.map(([, r]) => r))) / 2 * S, 60), 'the crate stack has no circle shadow');
}
console.log(`${passes} checks passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
