// Independent checks for the generated Cauldron Hill entrance map (we cannot launch Dungeondraft from here): structure against a real
// map of the same build, asset paths, array sizes, geometry against the encounter grid (re-derived here from the HTML on purpose, not
// from structure.mjs, so a mistake in the structure shows up as a mismatch) and the user's mapping rules. The checks every map shares
// live in lib/map-checks.mjs.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REFERENCE_MAP, REPO_DIR } from '../../config.mjs';
import { cliArg, cliMapPath } from '../../lib/cli.mjs';
import { parseEdgeGrid } from '../../lib/edge-grid.mjs';
import { checkArraySizes, checkAssets, checkColorable, checkMappingRules, checkNodes, checkShadowTextures, checkStructure, checkWallOrder, createChecker, loadMap, mapFileIn, pool, splitObjects, vec } from '../../lib/map-checks.mjs';
import { SHADOW_PATH_LAYER } from '../../lib/shadows.mjs';

const ENCOUNTER = 'cauldron-hill-entrance';
const S = 256, COLS = 40, ROWS = 28;
const MAP = cliMapPath(mapFileIn(MAPS_OUT_DIR, ENCOUNTER));
const REF = cliArg('--ref', REFERENCE_MAP);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'maps', `${ENCOUNTER}.html`));
const map = loadMap(MAP);
const ref = loadMap(REF);
const { ok, finish } = createChecker();

// The encounter, read again here: terrain label, height and edges of every cell
const html = fs.readFileSync(HTML, 'utf8');
const grid = parseEdgeGrid(html, { size: S });
const height = new Map();
for (const m of html.matchAll(/<[^<>]*\btitle="Column (\d+), row (\d+):[^"]*"[^<>]*\bdata-height="(-?\d+)"[^<>]*>/g)) { height.set(`${m[1]},${m[2]}`, Number(m[3])); }
const cells = [...grid.cells.values()].map((c) => ({ ...c, h: height.get(`${c.c},${c.r}`) }));
const at = (c, r) => cells.find((x) => x.c === c && x.r === r);
const centre = (cell) => [(cell.c - 0.5) * S, (cell.r - 0.5) * S];
const lv = map.world.levels['0'];
const LABEL = { tree: 'Dead tree (blocking)', boulder: 'Boulder (blocking)', machine: 'Hydraulic mechanism (blocking)', rock: 'Solid rock (off-map)', ward: 'Ward post (cover)', slag: 'Slag heap (cover)', cart: 'Rail cart (cover)', pyre: 'Unlit pyre (cover)', ramp: 'Worn ascent (ramp)', lever: 'Door lever', gate: 'Rusted ring gate', diff: 'Scrub and scree (difficult)', open: 'Open ground' };

// 1. structure vs a real map made by the same Dungeondraft build
checkStructure(ok, map, ref);

// 2. array sizes
ok(map.world.width === COLS && map.world.height === ROWS, `map is ${map.world.width}x${map.world.height}, expected the encounter grid ${COLS}x${ROWS}`);
ok(grid.cols === COLS && grid.rows === ROWS && cells.every((c) => c.h !== undefined), 'encounter grid is not 40 x 28 with a height on every cell');
const { caveLen, splat } = checkArraySizes(ok, map);

// 3. every res:// path exists in the packs, and the manifest lists exactly the packs used
checkAssets(ok, map);

// 4. geometry vs the encounter grid
const distSeg = (x, y, [ax, ay], [bx, by]) => { const l2 = (bx - ax) ** 2 + (by - ay) ** 2; const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0; return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y); };
const distPath = (x, y, pts) => Math.min(...pts.slice(1).map((q, i) => distSeg(x, y, pts[i], q)));
const pathsOf = (re) => lv.paths.filter((p) => re.test(p.texture)).map((p) => { const [ox, oy] = vec(p.position); return { p, pts: pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]) }; });
const cliffs = pathsOf(/_cliff\.png$/);
const ramps = pathsOf(/stairs_path\.png$/);

// every edge of the encounter's walls and doors: its midpoint
const edgeMids = grid.edges.map((e) => ({ kind: e.kind, x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, horizontal: e.horizontal, e }));
// walls: axis-aligned, on grid lines, drawn only along real edges (mapping rule 5 for an edge grid: the wall IS the edge)
const wallRuns = lv.walls.map((w) => ({ w, pts: pool(w.points) }));
let runSegments = 0;
for (const { w, pts } of wallRuns) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    ok(horizontal !== vertical, `rule 5: wall ${w.node_id} segment ${i} is not axis-aligned`);
    ok((horizontal ? a[1] : a[0]) % S === 0 && (horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1])) % S === 0, `rule 5: wall ${w.node_id} segment ${i} is off the grid lines`);
    runSegments++;
    // every square of the segment has a wall or door edge of the encounter under it
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = S / 2; t < len; t += S) {
      const x = a[0] + ((b[0] - a[0]) * t) / len, y = a[1] + ((b[1] - a[1]) * t) / len;
      ok(edgeMids.some((m) => Math.hypot(m.x - x, m.y - y) < 2), `wall ${w.node_id} runs along (${Math.round(x)}, ${Math.round(y)}) where the encounter has no wall or door edge`);
    }
  }
}
// every wall or door edge is a wall (or, for a door, an empty portal), a cliff, or - only on the open north end of the tunnel - nothing
const portals = lv.walls.flatMap((w) => w.portals).map((p) => vec(p.position));
const nonWalls = [];
for (const m of edgeMids) {
  const onWall = wallRuns.some(({ pts }) => distPath(m.x, m.y, pts) < 2);
  const onCliff = cliffs.some(({ pts }) => distPath(m.x, m.y, pts) < 40);
  if (m.kind === 'door') {
    if (m.y === 0) { nonWalls.push(m); continue; } // the tunnel runs on north off the map
    ok(portals.some(([x, y]) => Math.hypot(x - m.x, y - m.y) < 2), `door edge at (${m.x}, ${m.y}) has no portal`);
  } else {
    ok(onWall || onCliff, `wall edge at (${m.x}, ${m.y}) is neither a wall nor a cliff`);
  }
}
ok(nonWalls.length === 2, `expected the two open tunnel-end door edges, found ${nonWalls.length}`);
ok(portals.length === grid.edges.filter((e) => e.kind === 'door').length - 2, `${portals.length} portals for ${grid.edges.filter((e) => e.kind === 'door').length - 2} doorways`);
ok(lv.walls.flatMap((w) => w.portals).every((p) => /\/empty\.png$/.test(p.texture)), 'craft rule 8: every doorway is the empty portal');
ok(wallRuns.length >= 8, `only ${wallRuns.length} wall polylines`);

// rule 7: every height change outside the buildings is a cliff or a worn ascent
{
  let edgeCount = 0, covered = 0;
  for (const a of cells) {
    for (const [dc, dr, side] of [[1, 0, 'E'], [0, 1, 'S']]) {
      const b = at(a.c + dc, a.r + dr);
      if (!b || a.h === b.h) { continue; }
      const rock = a.terrain === LABEL.rock || b.terrain === LABEL.rock;
      const ramp = a.terrain === LABEL.ramp || b.terrain === LABEL.ramp;
      const wall = a.walls.has(side);
      if (!wall) { ok(rock || ramp, `rule 7: height change (${a.c},${a.r}) +${a.h} / (${b.c},${b.r}) +${b.h} is an unmarked gap (no wall, no ascent)`); continue; }
      const mx = dc ? a.c * S : (a.c - 0.5) * S, my = dc ? (a.r - 0.5) * S : a.r * S;
      const foyerWall = wallRuns.some(({ w, pts }) => distPath(mx, my, pts) < 2 && /\/metaldark\.png$/.test(w.texture));
      if (foyerWall) { continue; } // the foyer's own wall is the face
      edgeCount++;
      const hit = cliffs.filter(({ pts }) => distPath(mx, my, pts) < 30);
      if (!hit.length) { ok(false, `rule 7: height change between (${a.c},${a.r}) +${a.h} and (${b.c},${b.r}) +${b.h} has no cliff along its edge`); continue; }
      covered++;
      const high = a.h > b.h ? [-dc, -dr] : [dc, dr];
      const good = hit.some(({ pts }) => {
        const i = pts.slice(1).map((q, k) => distSeg(mx, my, pts[k], q)).reduce((bi, d, k, arr) => (d < arr[bi] ? k : bi), 0);
        const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]], len = Math.hypot(...d);
        return (d[1] / len) * high[0] + (-d[0] / len) * high[1] > 0.9;
      });
      ok(good, `rule 7: cliff at the edge of (${a.c},${a.r}) / (${b.c},${b.r}) is turned so its lit top faces the low ground`);
    }
  }
  ok(edgeCount > 0 && covered === edgeCount, `${covered}/${edgeCount} cliff edges have a cliff strip`);
  // each worn ascent has a stair path over exactly its squares
  const rampCells = cells.filter((c) => c.terrain === LABEL.ramp);
  ok(ramps.length === 2 && rampCells.length === 4, `expected two worn ascents over four squares, found ${ramps.length} / ${rampCells.length}`);
  for (const c of rampCells) { const [x, y] = centre(c); ok(ramps.some(({ pts }) => Math.abs(pts[0][0] - x) < 260 && y > Math.min(pts[0][1], pts[1][1]) && y < Math.max(pts[0][1], pts[1][1])), `ascent square (${c.c},${c.r}) has no stair path`); }
  ok(ramps.every(({ pts }) => pts[0][1] > pts[1][1]), 'a worn ascent must climb north, onto the ledge');
}

// terrain: scrub squares are mire (slot 3), ledge squares rocky (slot 4), the open road is dirt (slot 2)
{
  const TW = COLS * 4;
  const w = (x, y, slot) => splat[(Math.floor(y / 64) * TW + Math.floor(x / 64)) * 4 + slot];
  const diff = cells.filter((c) => c.terrain === LABEL.diff && c.h === 0);
  const meanMire = diff.reduce((a, c) => a + w(...centre(c), 2), 0) / diff.length;
  ok(meanMire >= 150, `scrub squares are only ${meanMire.toFixed(0)}/255 mire on average`);
  const ledge = cells.filter((c) => c.h === 10 && c.terrain === LABEL.open);
  ok(ledge.every((c) => w(...centre(c), 3) >= 140), 'a ledge square is not mostly rocky ground');
  ok(w(5120, 3600, 1) >= 150, 'the road to the gate is not trampled dirt');
}

// set pieces sit on their squares: trees, boulders, the mechanism, carts, lever, ward posts, ring gates, the pyre
{
  const objAt = (re) => lv.objects.filter((o) => re.test(o.texture)).map((o) => ({ o, p: vec(o.position) }));
  const near = (list, cell, d) => list.some(({ p }) => Math.hypot(p[0] - centre(cell)[0], p[1] - centre(cell)[1]) < d);
  const trees = objAt(/\/dead_tree_[^/]*\.png$/);
  for (const c of cells.filter((x) => x.terrain === LABEL.tree)) { ok(near(trees, c, 120), `tree square (${c.c},${c.r}) has no dead tree over it`); }
  ok(trees.every(({ o }) => o.layer === 700), 'tree canopies belong above the walls (layer 700)');
  const rocks = objAt(/\/rock_stonecold_[^/]*\.png$/);
  for (const c of cells.filter((x) => x.terrain === LABEL.boulder)) { ok(near(rocks, c, 80), `boulder square (${c.c},${c.r}) has no boulder`); }
  const tank = objAt(/\/pressure_tank_1a\.png$/);
  ok(tank.length === 1 && Math.hypot(tank[0].p[0] - 4096, tank[0].p[1] - 1280) < 40, 'the hydraulic mechanism is not over (16-17, 5-6)');
  const carts = objAt(/\/mine_cart\.png$/);
  for (const c of cells.filter((x) => x.terrain === LABEL.cart)) { ok(near(carts, c, 85), `rail cart square (${c.c},${c.r}) has no cart`); }
  for (const c of cells.filter((x) => x.terrain === LABEL.lever)) { ok(near(objAt(/\/mechanism_lever_01a\.png$/), c, 85), `lever square (${c.c},${c.r}) has no lever`); }
  const posts = objAt(/\/lantern_post_3b\.png$/);
  for (const c of cells.filter((x) => x.terrain === LABEL.ward)) { ok(near(posts, c, 85), `ward post square (${c.c},${c.r}) has no post`); }
  for (const c of cells.filter((x) => x.terrain === LABEL.slag)) { ok(near(objAt(/\/coal_03\.png$/), c, 85), `slag heap square (${c.c},${c.r}) has no heap`); }
  for (const c of cells.filter((x) => x.terrain === LABEL.pyre)) { ok(near(objAt(/\/firepit_01a\.png$/), c, 85), `pyre square (${c.c},${c.r}) has no pyre`); }
  const cogs = objAt(/\/gears_metal_[^/]*\.png$/i);
  const gates = cells.filter((x) => x.terrain === LABEL.gate);
  ok(gates.length === 8 && cogs.length === 4, `expected four ring gates (eight squares) with four cogs, found ${gates.length} squares / ${cogs.length} cogs`);
  for (const c of gates) { ok(near(cogs, c, 260), `ring gate square (${c.c},${c.r}) has no cog`); }
}

checkColorable(ok, map);

// 5. the user's mapping rules (the dungeondraft skill): 1, 2, 4 and 6 are shared, 3 is checked here
const { propObjects } = splitObjects(lv);
checkMappingRules(ok, map, { S, caveLen });
{
  // rule 3: a floor against a bare map, and difficult terrain must be noticeably denser than the ordinary ground around it
  const clutter = lv.objects.filter((o) => o.layer === 300 && !/\/(pressure_tank|mine_cart|gears_metal|firepit|Bed_Cot|lantern_post|coal_0|rock_stonecold_(?:10|27))/i.test(o.texture));
  ok(clutter.length >= 200, `rule 3: only ${clutter.length} ground-detail objects (the map looks bare)`);
  const inCell = (o) => { const [x, y] = vec(o.position); return `${Math.floor(x / S) + 1},${Math.floor(y / S) + 1}`; };
  const diff = new Set(cells.filter((c) => c.terrain === LABEL.diff && c.h === 0).map((c) => `${c.c},${c.r}`));
  const plain = new Set(cells.filter((c) => c.terrain === LABEL.open && c.h === 0 && c.c > 0 && !(c.c >= 16 && c.c <= 25 && c.r <= 6)).map((c) => `${c.c},${c.r}`));
  const diffN = clutter.filter((o) => diff.has(inCell(o))).length / diff.size;
  const plainN = clutter.filter((o) => plain.has(inCell(o))).length / plain.size;
  ok(diffN >= 1.8 * plainN, `rule 3: difficult terrain has ${diffN.toFixed(2)} clutter per square against ${plainN.toFixed(2)} on ordinary ground (needs to be noticeably denser)`);
}
ok(lv.patterns.length >= 4, 'floors are patterns');

// 6. nodes and bounds, wall order
checkNodes(ok, map, { S, margin: 400 });
checkWallOrder(ok, map);
ok(lv.patterns.every((p) => p.layer <= Math.min(...propObjects.map((o) => o.layer))), 'a pattern sits above an object layer and could cover objects');

// 7. BW shadows: only circles under the big props; shadow paths are the user's to place by hand, so none may be generated
{
  const { shadowPaths, shadowObjects } = checkShadowTextures(ok, map, { pathLayer: SHADOW_PATH_LAYER, onlyShadowPaths: false });
  ok(shadowPaths.length === 0, `${shadowPaths.length} shadow paths generated: the user places those by hand`);
  const isBoulder = (o) => /[/]rock_stonecold_/.test(o.texture) && o.layer === 300 && vec(o.scale)[0] >= 0.95
    && cells.some((c) => c.terrain === LABEL.boulder && Math.hypot(vec(o.position)[0] - centre(c)[0], vec(o.position)[1] - centre(c)[1]) < 80);
  const big = lv.objects.filter((o) => /[/](dead_tree_|pressure_tank_1a|firepit_01a)/.test(o.texture) || isBoulder(o));
  for (const o of big) {
    const p = vec(o.position);
    ok(shadowObjects.some((s) => { const [sx, sy] = vec(s.position); return Math.hypot(sx - p[0], sy - p[1]) < 60; }), `big prop ${o.texture.split('/').pop()} at (${Math.round(p[0])}, ${Math.round(p[1])}) has no circle shadow`);
  }
}
finish();
