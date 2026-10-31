// Independent checks for the generated Dungeondraft map (we cannot launch Dungeondraft from here): structure against a real map of
// the same build, asset paths, array sizes, walls and doorways against the encounter's edge grid, floors, layering, the user's
// mapping rules, and the shadows. The checks every map shares live in lib/map-checks.mjs. The geometry here is re-derived from
// the raw edge grid (lib/edge-grid.mjs) and the room extents the encounter describes, not from structure.mjs, so a mistake in
// the structure shows up as a mismatch.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REFERENCE_MAP, REPO_DIR } from '../../config.mjs';
import { cliArg, cliMapPath } from '../../lib/cli.mjs';
import { parseEdgeGrid } from '../../lib/edge-grid.mjs';
import { locateOnPolyline, pointInPolygon } from '../../lib/geometry.mjs';
import { SHADOW_PATH_LAYER } from '../../lib/shadows.mjs';
import { checkArraySizes, checkAssets, checkColorable, checkMappingRules, checkNodes, checkShadowTextures, checkStructure, checkWallOrder, createChecker, loadMap, mapFileIn, pool, splitObjects, vec } from '../../lib/map-checks.mjs';

const ENCOUNTER = 'grappa-safehouse-v2';
const S = 256;
const MAP = cliMapPath(mapFileIn(MAPS_OUT_DIR, ENCOUNTER));
const REF = cliArg('--ref', REFERENCE_MAP);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'encounters', 'grappav2', `${ENCOUNTER}.html`));
const map = loadMap(MAP);
const ref = loadMap(REF);
const html = fs.readFileSync(HTML, 'utf8');
const base = parseEdgeGrid(html, { size: S });
const { ok, finish } = createChecker();
const lv = map.world.levels['0'];

// the encounter is 16 x 14; the user added a 2-row corridor south and a 4-column street east
const COLS = base.cols + 4, ROWS = base.rows + 2;

// 1. structure vs a real map made by the same Dungeondraft build
checkStructure(ok, map, ref);
// 2. array sizes and the map size
const { W, H, caveLen, splat } = checkArraySizes(ok, map);
ok(W === COLS && H === ROWS, `the map is ${W} x ${H}, expected ${COLS} x ${ROWS} (encounter grid + corridor + street)`);
ok(splat.length === 16 * W * H * 4, 'terrain splat size');
// 3. every res:// path exists in the packs, and the manifest lists exactly the packs used
checkAssets(ok, map);
checkColorable(ok, map);

// 4. walls and doorways vs the edge grid
/** Unit (one square long) edges as keys: "h:x:y" runs east from (x, y); "v:x:y" runs south. */
const unitKey = (horizontal, x, y) => `${horizontal ? 'h' : 'v'}:${Math.round(x)}:${Math.round(y)}`;
const expectedWalls = new Set(), expectedDoors = new Set();
for (const e of base.edges) { (e.kind === 'door' ? expectedDoors : expectedWalls).add(unitKey(e.horizontal, e.x1, e.y1)); }
for (let c = 0; c < 16; c++) { expectedWalls.add(unitKey(true, c * S, ROWS * S)); } // the corridor's south wall
for (let r = base.rows; r < ROWS; r++) { expectedWalls.add(unitKey(false, 16 * S, r * S)); } // the east wall carried down beside the corridor

const standing = [], gaps = [];
for (const w of lv.walls) {
  const P = pool(w.points);
  ok(w.loop === false && w.joint === 0, `wall ${w.node_id}: open polyline with sharp joints`);
  const segs = P.slice(0, -1).map((a, i) => [a, P[i + 1]]);
  for (const [a, b] of segs) {
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    const onLine = (v) => Math.abs(v / S - Math.round(v / S)) < 0.5 / S;
    ok((horizontal && onLine(a[1])) || (vertical && onLine(a[0])), `rule 5: wall ${w.node_id} segment (${a} to ${b}) is not on a square edge`);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / S);
    ok(Math.abs(len - n * S) < 0.5, `wall ${w.node_id}: segment length ${len} is not whole squares`);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    for (let i = 0; i < n; i++) {
      const x = a[0] + d[0] * S * i, y = a[1] + d[1] * S * i;
      standing.push(unitKey(horizontal, Math.min(x, x + d[0] * S), Math.min(y, y + d[1] * S)));
    }
  }
  for (const p of w.portals) {
    const [px, py] = vec(p.position);
    const at = locateOnPolyline(P, false, px, py);
    ok(at && at.dist < 0.5 && p.point_index === at.index && Math.abs(p.wall_distance - (at.index + at.t)) < 1e-4, `portal ${p.node_id}: wall_distance ${p.wall_distance} vs segment ${at?.index} + ${at?.t}`);
    ok(Math.abs(p.rotation - Math.atan2(at.direction[1], at.direction[0])) < 1e-4 && p.wall_id === w.node_id && p.closed === false, `portal ${p.node_id}: rotation, wall id and open state`);
    const horizontal = Math.abs(at.direction[1]) < 0.5;
    gaps.push(horizontal ? unitKey(true, px - S / 2, py) : unitKey(false, px, py - S / 2));
  }
}
ok(new Set(standing).size === standing.length, 'two wall runs lie on the same edge');
// wall order: a partition that runs into a wall is drawn before it, and the building's outline (the stone wall) is drawn last
checkWallOrder(ok, map);
ok(lv.walls.length > 0 && lv.walls.slice(0, -1).every((w) => !/wall1a/.test(w.texture)) && /wall1a/.test(lv.walls[lv.walls.length - 1].texture), 'the building outline must be the last wall in the file, so it draws over every partition');
ok(lv.walls.flatMap((w) => w.portals).every((p) => /\/packs\/VKLE9DsR\/textures\/portals\/empty\.png$/.test(p.texture)), 'every doorway is the invisible Interior empty portal');
const gapSet = new Set(gaps);
ok(gapSet.size === gaps.length, 'two doorways on the same edge');
const standingOnly = new Set(standing.filter((k) => !gapSet.has(k)));
const missing = [...expectedWalls].filter((k) => !standingOnly.has(k)), extra = [...standingOnly].filter((k) => !expectedWalls.has(k));
ok(missing.length === 0, `${missing.length} wall edges of the grid are not drawn: ${missing.slice(0, 4)}`);
ok(extra.length === 0, `${extra.length} wall edges are drawn that the grid does not have: ${extra.slice(0, 4)}`);
ok([...expectedDoors].every((k) => gapSet.has(k)) && gapSet.size === expectedDoors.size, `doorways must be exactly the grid's ${expectedDoors.size} door edges (found ${gapSet.size})`);
ok(![...standingOnly, ...gapSet].some((k) => k.startsWith('v:0:') && Number(k.split(':')[2]) >= base.rows * S), 'the corridor must run on past the west edge of the map: no wall closes it there');

// 5. floors: every square of each area is covered exactly once by that area's floor
const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];
const polys = (layer, re) => lv.patterns.filter((p) => p.layer === layer && re.test(p.texture)).map((p) => pool(p.points));
const AREAS = [
  { name: 'records', c: [1, 10], r: [1, 8], layer: -100, re: /wood_4a/ },
  { name: 'store', c: [11, 16], r: [1, 8], layer: -100, re: /Stone_Tiled_Dark/ },
  { name: 'common', c: [1, 16], r: [9, 14], layer: -100, re: /wood_1a/ },
  { name: 'corridor', c: [1, 16], r: [15, 16], layer: -100, re: /planks_1a/ },
  { name: 'street', c: [17, 20], r: [1, 16], layer: -400, re: /cobbles_1c/ },
];
for (const area of AREAS) {
  const floors = polys(area.layer, area.re);
  let bad = 0;
  for (let c = area.c[0]; c <= area.c[1]; c++) {
    for (let r = area.r[0]; r <= area.r[1]; r++) { if (floors.filter((poly) => pointInPolygon(centre(c, r), poly)).length !== 1) { bad++; } }
  }
  ok(bad === 0, `${area.name}: ${bad} squares are not covered exactly once by the floor pattern`);
}
{
  // room floors never overlap the street cobbles' squares and no floor pattern spills outside the map
  const all = lv.patterns.flatMap((p) => pool(p.points));
  ok(all.every(([x, y]) => x >= -0.5 && y >= -0.5 && x <= W * S + 0.5 && y <= H * S + 0.5), 'a pattern reaches outside the map');
}
// terrain: the whole map is painted
{
  let unpainted = 0;
  for (let i = 0; i < splat.length; i += 4) { if (splat[i] + splat[i + 1] + splat[i + 2] + splat[i + 3] === 0) { unpainted++; } }
  ok(unpainted === 0, `${unpainted} terrain texels are unpainted`);
}
// layering: a pattern never sits above an object it overlaps (so it could cover it)
{
  const { propObjects, shadowObjects } = splitObjects(lv);
  let covered = 0;
  for (const p of lv.patterns) {
    const poly = pool(p.points);
    for (const o of [...propObjects, ...shadowObjects]) { if (o.layer < p.layer && pointInPolygon(vec(o.position), poly)) { covered++; } }
  }
  ok(covered === 0, `${covered} objects sit under a pattern on a higher layer and would be hidden`);
  ok(propObjects.every((o) => o.layer <= 300 || o.layer === 700), 'props use layers up to 300, and 700 only for wall lamps (400 belongs to the shadow paths)');
}

// 6. the user's mapping rules: 1, 2, 4 and 6 are shared; 3 and 5 are checked here
const { propObjects, shadowObjects } = splitObjects(lv);
checkMappingRules(ok, map, { S, caveLen });
{
  const clutter = lv.objects.filter((o) => o.layer === 100);
  ok(clutter.length >= 40, `rule 3: only ${clutter.length} small ground-detail objects (the map looks bare)`);
  // difficult squares carry noticeably more clutter than ordinary squares
  const label = (c, r) => base.cells.get(`${c},${r}`)?.terrain ?? '';
  const inSquare = (c, r) => clutter.filter((o) => { const [x, y] = vec(o.position); return Math.floor(x / S) + 1 === c && Math.floor(y / S) + 1 === r; }).length;
  const density = (pick) => { let n = 0, k = 0; for (let c = 1; c <= base.cols; c++) { for (let r = 1; r <= base.rows; r++) { if (pick(label(c, r))) { n += inSquare(c, r); k++; } } } return n / Math.max(k, 1); };
  const hard = density((t) => /papers/.test(t)), plain = density((t) => t === 'floor');
  ok(hard >= 2 * plain && hard >= 2, `rule 3: difficult squares average ${hard.toFixed(2)} clutter pieces, ordinary squares ${plain.toFixed(2)}`);
  ok(clutter.every((o) => { const s = vec(o.scale)[0]; return s >= 0.8 && s <= 1.2; }), 'clutter scale');
}
// the squares that carry a rule (cover, blocking) have furniture on them (craft rule 5)
for (const cell of base.cells.values()) {
  if (!/low furniture|tall cases/.test(cell.terrain)) { continue; }
  const [cx, cy] = centre(cell.c, cell.r);
  const near = propObjects.filter((o) => o.layer >= 200 && o.layer <= 300).some((o) => { const [x, y] = vec(o.position); return Math.hypot(x - cx, y - cy) < 330; });
  ok(near, `square (${cell.c},${cell.r}) is ${cell.terrain} but has no furniture near it`);
}
{
  // Grappa's trolley sits on his square
  const ally = JSON.parse(fs.readFileSync(HTML.replace(/\.html$/, '.json'), 'utf8')).deployment.find((d) => d.side === 'ally');
  const [gx, gy] = centre(ally.x, ally.y);
  ok(propObjects.some((o) => /foodcart/.test(o.texture) && Math.hypot(vec(o.position)[0] - gx, vec(o.position)[1] - gy) < 60), 'the luggage trolley is not on Grappa\'s square');
}

// 7. BW shadows, re-derived from the edge grid: each standing wall edge is shaded on every side that lies on the map, the shade
// stops at the doorways, and a circle sits under every big prop
{
  const { shadowPaths } = checkShadowTextures(ok, map, { pathLayer: SHADOW_PATH_LAYER, onlyShadowPaths: false });
  const propTop = Math.max(...propObjects.filter((o) => o.layer < 600).map((o) => o.layer));
  ok(shadowPaths.every((p) => p.layer >= propTop && p.layer < 600), `a shadow path must sit at or above the highest prop layer under the walls (${propTop}) and below the walls`);
  const runs = shadowPaths.map((p) => { const [ox, oy] = vec(p.position); return { name: p.texture.split('/').pop(), pts: pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]) }; });
  ok(runs.every(({ pts }) => pts.length === 2), 'wall shadows are straight two-point runs');
  /** Runs lying along the edge `key`'s line whose span covers the edge's midpoint, split by which side they fade to. */
  const shading = (horizontal, x, y) => {
    const mid = horizontal ? [x + S / 2, y] : [x, y + S / 2];
    const out = { before: [], after: [] }; // before = north/west, after = south/east
    for (const run of runs) {
      const [a, b] = run.pts;
      const onLine = horizontal ? Math.abs(a[1] - y) < 0.5 && Math.abs(b[1] - y) < 0.5 : Math.abs(a[0] - x) < 0.5 && Math.abs(b[0] - x) < 0.5;
      const lo = horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horizontal ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
      const at = horizontal ? mid[0] : mid[1];
      if (!onLine || at < lo - 0.5 || at > hi + 0.5) { continue; }
      const d = [b[0] - a[0], b[1] - a[1]], left = [d[1], -d[0]]; // left of travel on screen
      const sign = horizontal ? left[1] : left[0];
      (sign < 0 ? out.before : out.after).push(run);
    }
    return out;
  };
  const onMap = (c, r) => c >= 1 && r >= 1 && c <= COLS && r <= ROWS;
  let wrong = 0, doors = 0;
  for (const key of standingOnly) {
    const [kind, sx, sy] = key.split(':'), horizontal = kind === 'h', x = Number(sx), y = Number(sy);
    const sh = shading(horizontal, x, y);
    // the squares either side: for a horizontal edge, north then south; for a vertical one, west then east
    const squares = horizontal ? [[x / S + 1, y / S], [x / S + 1, y / S + 1]] : [[x / S, y / S + 1], [x / S + 1, y / S + 1]];
    [sh.before, sh.after].forEach((got, i) => {
      const [c, r] = squares[i];
      const want = onMap(c, r) ? 1 : 0;
      if (got.length !== want) { wrong++; }
      // east face of the building is Large (the street); everything else is a tight Small contact shade
      const street = !horizontal && x === 16 * S && i === 1;
      if (onMap(c, r) && got.length === 1 && !new RegExp(`_Half_Shadow_${street ? 'Large' : 'Small'}_`).test(got[0].name)) { wrong++; }
    });
  }
  ok(wrong === 0, `${wrong} wall faces are shaded wrongly (missing, doubled, on the wrong side, or the wrong size)`);
  for (const key of gapSet) {
    const [kind, sx, sy] = key.split(':'), sh = shading(kind === 'h', Number(sx), Number(sy));
    doors += sh.before.length + sh.after.length;
  }
  ok(doors === 0, `${doors} shadow runs cross a doorway`);

  // a circle under every big prop: the tall blocks, the desk, the toppled cupboard and the carriage
  const circleNear = (x, y, r = 120) => shadowObjects.some((o) => { const [sx, sy] = vec(o.position); return Math.hypot(sx - x, sy - y) < r; });
  const tall = [...base.cells.values()].filter((c) => /tall cases/.test(c.terrain));
  const blocks = [[2, 4, 1, 1], [1, 1, 4, 5], [12, 13, 2, 3], [7, 8, 11, 11]];
  for (const [c1, c2, r1, r2] of blocks) {
    const inBlock = tall.filter((c) => c.c >= c1 && c.c <= c2 && c.r >= r1 && c.r <= r2);
    ok(inBlock.length === (c2 - c1 + 1) * (r2 - r1 + 1), `tall block ${c1}-${c2} x ${r1}-${r2} is not the grid's`);
    ok(circleNear(((c1 + c2 - 1) / 2) * S, ((r1 + r2 - 1) / 2) * S, c1 === 2 ? 260 : 120), `tall block ${c1}-${c2} x ${r1}-${r2} has no circle shadow`);
  }
  ok(circleNear(1010, 1175, 90) && circleNear(2040, 500, 90), 'the desk and the toppled cupboard need circle shadows');
  ok(circleNear(4096 + 2.45 * S, 3 * S, 100), 'the carriage needs a circle shadow');
}

// seam lines: wherever one room's floor meets the next across a doorway the patterns touch with nothing to hide the seam, so every
// doorway unit carries the thin line path (once), and no seam line lies anywhere else
{
  const seams = lv.paths.filter((p) => !p.texture.startsWith('res://packs/IFGltsLb/'));
  ok(seams.length > 0 && seams.every((p) => p.texture === 'res://packs/DZw7eElc/textures/paths/line.png' && p.width === 13 && p.layer === 100), 'seam lines are the Buildings line path, 13 px, on layer 100');
  const covered = [];
  for (const p of seams) {
    const [ox, oy] = vec(p.position), pts = pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]);
    ok(pts.length === 2, 'a seam line is one straight run');
    const [a, b] = pts, horizontal = Math.abs(a[1] - b[1]) < 0.5;
    ok(horizontal ? Math.abs(a[1] / S - Math.round(a[1] / S)) < 0.5 / S : Math.abs(a[0] / S - Math.round(a[0] / S)) < 0.5 / S, 'a seam line lies on a grid line (the wall line)');
    const lo = horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horizontal ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
    for (let t = lo; t < hi - 0.5; t += S) { covered.push(horizontal ? unitKey(true, t, a[1]) : unitKey(false, a[0], t)); }
  }
  ok(new Set(covered).size === covered.length, 'two seam lines cover the same doorway unit');
  ok(covered.length === gapSet.size && covered.every((k) => gapSet.has(k)), `seam lines must cover exactly the ${gapSet.size} doorway units (they cover ${covered.length})`);
}

// wall hangings (bookcases, pictures, mirrors, the clock, posters) are against a wall and never stand in a doorway
{
  const hung = propObjects.filter((o) => /\/(painting_wall|painting_upright|mirror_upright|wall_clock|poster_|shelf_[24][ab])/i.test(o.texture) && (o.layer === 300 || o.layer === 200));
  const doorCentres = [...gapSet].map((k) => { const [kind, sx, sy] = k.split(':'); return kind === 'h' ? { horizontal: true, x: Number(sx) + S / 2, y: Number(sy) } : { horizontal: false, x: Number(sx), y: Number(sy) + S / 2 }; });
  let inDoor = 0;
  for (const o of hung) {
    const [x, y] = vec(o.position);
    if (doorCentres.some((d) => (d.horizontal ? Math.abs(x - d.x) < 128 && Math.abs(y - d.y) < 140 : Math.abs(y - d.y) < 128 && Math.abs(x - d.x) < 140))) { inDoor++; }
  }
  ok(hung.length >= 10, `only ${hung.length} bookcases and pictures hang on the walls`);
  ok(inDoor === 0, `${inDoor} wall hangings stand in a doorway`);
}

// 8. nodes
checkNodes(ok, map, { S, margin: 300 });
finish();
