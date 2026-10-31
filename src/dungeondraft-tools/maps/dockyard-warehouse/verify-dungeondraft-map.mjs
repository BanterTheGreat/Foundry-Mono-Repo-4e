// Independent checks for the generated Dungeondraft map (we cannot launch Dungeondraft from here): structure against a real
// map of the same build, asset paths, array sizes, geometry against the encounter grid, and the user's mapping rules. The checks
// every map shares live in lib/map-checks.mjs; the geometry here is re-derived from the grid, not from structure.mjs.
// Usage: node verify-dungeondraft-map.mjs [map] [--ref "<real 1.2.0.1 map>"] [--html encounter.html]
// Exits 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, MAPS_OUT_DIR, REFERENCE_MAP } from '../../config.mjs';
import { cliArg, cliMapPath } from '../../lib/cli.mjs';
import { locateOnPolyline, pointInPolygon } from '../../lib/geometry.mjs';
import { SHADOW_LAYER, SHADOW_PATH_LAYER, isShadowTexture } from '../../lib/shadows.mjs';
import { checkArraySizes, checkAssets, checkColorable, checkMappingRules, checkNodes, checkShadowTextures, checkStructure, createChecker, loadMap, mapFileIn, pool, splitObjects, vec } from '../../lib/map-checks.mjs';
import { COLS, LABEL, ROWS, S, blocksOf, parseGrid } from './grid.mjs';

const ENCOUNTER = 'dockyard-warehouse';
const MAP = cliMapPath(mapFileIn(MAPS_OUT_DIR, ENCOUNTER, `${ENCOUNTER}-v2`));
const REF = cliArg('--ref', REFERENCE_MAP);
const HTML = cliArg('--html', path.join(ARTIFACTS_DIR, `${ENCOUNTER}.html`));
const map = loadMap(MAP);
const ref = loadMap(REF);
const grid = parseGrid(fs.readFileSync(HTML, 'utf8'));
const { ok, finish } = createChecker();
const lv = map.world.levels['0'];

// 1. structure vs a real map made by the same Dungeondraft build
checkStructure(ok, map, ref);
// 2. array sizes
const { W, H, caveLen, splat } = checkArraySizes(ok, map);
// 3. every res:// path exists in the packs, and the manifest lists exactly the packs used
checkAssets(ok, map);

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
// every square inside the wall line (wall squares, doorways and room alike) is covered exactly once by the plank floor (layer
// -100) and by no masonry (a wall square is walkable floor), and the paving (layer -400) covers all land squares and none of the water
const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];
const polys = (layer, nameRe) => lv.patterns.filter((p) => p.layer === layer && nameRe.test(p.texture)).map((p) => pool(p.points));
const masonry = polys(-100, /Stone_Sidewalk/i), floors = polys(-100, /planks_1b/i);
ok(masonry.length === 0, 'wall squares are walkable floor: there must be no masonry pattern');
const doorKey = new Set(doorCells.map(([c, r]) => `${c},${r}`));
for (let c = ring.c1; c <= ring.c2; c++) {
  for (let r = ring.r1; r <= ring.r2; r++) {
    const pt = centre(c, r);
    const f = floors.filter((poly) => pointInPolygon(pt, poly)).length;
    ok(f === 1, `square (${c},${r}): plank floor x${f}, expected exactly one`);
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
  const topPattern = Math.max(...lv.patterns.map((p) => p.layer)), lowObject = Math.min(...lv.objects.filter((o) => !isShadowTexture(o.texture)).map((o) => o.layer));
  ok(topPattern <= lowObject, `a pattern on layer ${topPattern} could cover objects on layer ${lowObject}`);
}

checkColorable(ok, map);

// 5. the user's mapping rules (the dungeondraft skill): 1, 2, 4 and 6 are shared, 3 and 5 are checked here
// Rule 1 covers props; the BW shadow circles are exempt (the user sets them at 1.3 and above) and get their own range in section 7.
const { propObjects, shadowObjects } = splitObjects(lv);
checkMappingRules(ok, map, { S, caveLen });
{
  // A floor against a bare map only (about a quarter of an object per land square). The density itself is set by the
  // generator's CLUTTER_CUTS, so a further cut must not trip this check.
  const clutter = lv.objects.filter((o) => o.layer === 100).length;
  ok(clutter >= 60, `rule 3: only ${clutter} small ground-detail objects (the map looks bare)`);
}
for (const { w, P } of loops) {
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length];
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    const onLine = (v) => Math.abs(v / S - Math.round(v / S)) < 0.5 / S;
    ok((horizontal && onLine(a[1])) || (vertical && onLine(a[0])), `rule 5: wall ${w.node_id} segment ${i} (${a} to ${b}) is not on a square edge`);
  });
}
// 7. BW shadows, re-derived from the grid (not from structure.mjs): half shadows along the outer wall, one fading outdoors and a
// tighter one fading onto the floor inside (both stopping at the doorways), a circle under every big prop, all on the shadow layer
// and never buried under a pattern on a higher layer.
{
  const { shadowPaths } = checkShadowTextures(ok, map, { pathLayer: SHADOW_PATH_LAYER });
  // the user's rule: shadow paths sit below the walls (which draw above layers 100-400, i.e. below 600) but above every prop, so they shade the props too
  const propTop = Math.max(...propObjects.filter((o) => o.layer < 600).map((o) => o.layer));
  ok(lv.paths.every((p) => p.layer >= propTop && p.layer < 600), `a shadow path must sit at or above the highest prop layer under the walls (${propTop}) and below the walls`);

  const runs = shadowPaths.map((p) => { const [ox, oy] = vec(p.position); return { p, pts: pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]) }; });
  ok(runs.every(({ pts }) => pts.length === 2), 'wall shadows are straight two-point runs');
  const centreX = ((ring.c1 - 1) * S + ring.c2 * S) / 2, centreY = ((ring.r1 - 1) * S + ring.r2 * S) / 2;
  /** The sides of one rectangle: where it runs, which door squares break it, and which way a correct shadow fades. */
  const sides = (inset) => {
    const [x0, y0, x1, y1] = [(ring.c1 - 1 + inset) * S, (ring.r1 - 1 + inset) * S, (ring.c2 - inset) * S, (ring.r2 - inset) * S];
    return [
      { name: 'top', fixed: y0, lo: x0, hi: x1, horizontal: true, doors: doorCells.filter(([, r]) => r === ring.r1).map(([c]) => [(c - 1) * S, c * S]) },
      { name: 'bottom', fixed: y1, lo: x0, hi: x1, horizontal: true, doors: doorCells.filter(([, r]) => r === ring.r2).map(([c]) => [(c - 1) * S, c * S]) },
      { name: 'left', fixed: x0, lo: y0, hi: y1, horizontal: false, doors: doorCells.filter(([c]) => c === ring.c1).map(([, r]) => [(r - 1) * S, r * S]) },
      { name: 'right', fixed: x1, lo: y0, hi: y1, horizontal: false, doors: doorCells.filter(([c]) => c === ring.c2).map(([, r]) => [(r - 1) * S, r * S]) },
    ];
  };
  // both shades run along the wall line: Large fading outdoors, Small fading into the building
  for (const [inset, size, outward] of [[0, 'Large', true], [0, 'Small', false]]) {
    const kind = outward ? 'outer shade' : 'inner contact shade';
    for (const side of sides(inset)) {
      const along = (q) => (side.horizontal ? q[0] : q[1]), across = (q) => (side.horizontal ? q[1] : q[0]);
      const mine = runs.filter(({ p, pts }) => pts.every((q) => Math.abs(across(q) - side.fixed) < 0.5) && new RegExp(`_Half_Shadow_${size}_`).test(p.texture));
      ok(mine.every(({ p }) => new RegExp(`_Half_Shadow_${size}_`).test(p.texture)), `${kind} ${side.name}: shadows must be Half ${size}`);
      // every run fades to the correct side: left of travel (u.y, -u.x) points away from the building centre outdoors, towards it indoors
      for (const { pts, p } of mine) {
        const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], l = Math.hypot(...u);
        const left = [u[1] / l, -u[0] / l], mid = [(pts[0][0] + pts[1][0]) / 2 - centreX, (pts[0][1] + pts[1][1]) / 2 - centreY];
        ok((left[0] * mid[0] + left[1] * mid[1] > 0) === outward, `${kind} ${side.name} (${p.node_id}): the fade lies on the wrong side of the wall`);
      }
      // coverage: every 32 px of the side is shaded exactly once, except across the doorways
      let bad = 0;
      for (let t = side.lo + 16; t < side.hi; t += 32) {
        const inDoor = side.doors.some(([a, b]) => t > a && t < b);
        const hits = mine.filter(({ pts }) => t >= Math.min(along(pts[0]), along(pts[1])) - 0.5 && t <= Math.max(along(pts[0]), along(pts[1])) + 0.5).length;
        if (hits !== (inDoor ? 0 : 1)) { bad++; }
      }
      ok(bad === 0, `${kind} ${side.name}: ${bad} stretches are shaded across a doorway, unshaded, or doubled`);
    }
  }
  // rule 7: the quay edge (the first water column) has one full-height half shadow running south, so its fade falls east across the water
  const quayX = (Math.min(...grid.cells(LABEL.WATER).map(([c]) => c)) - 1) * S;
  const quayRuns = runs.filter(({ pts }) => pts.every((q) => Math.abs(q[0] - quayX) < 0.5));
  ok(quayRuns.length === 1 && /_Half_Shadow_Large_/.test(quayRuns[0].p.texture), 'the quay edge needs exactly one Half Large shadow');
  ok(quayRuns.length === 1 && Math.abs(quayRuns[0].pts[0][1]) < 0.5 && Math.abs(quayRuns[0].pts[1][1] - H * S) < 0.5, 'the quay shadow must span the whole map height, north to south (fade east onto the water)');
  const onSide = (pts, inset) => sides(inset).some((s) => pts.every((q) => Math.abs((s.horizontal ? q[1] : q[0]) - s.fixed) < 0.5));
  ok(runs.every(({ pts }) => onSide(pts, 0) || quayRuns.some((r) => r.pts === pts)), 'a shadow path lies on neither the wall line nor the quay edge');

  // a circle under every big prop: each tall cargo stack (centre of its block) and the ledger desk
  const big = [];
  for (const b of blocksOf(grid, LABEL.TALL)) { big.push({ what: `stack ${b.c1}-${b.c2} x ${b.r1}-${b.r2}`, p: [((b.c1 + b.c2 - 1) / 2) * S, ((b.r1 + b.r2 - 1) / 2) * S] }); }
  { const [lc, lr] = grid.cells(LABEL.LEDGER)[0]; big.push({ what: 'ledger desk', p: [(lc - 0.5) * S, (lr - 0.5) * S] }); }
  for (const { what, p } of big) {
    ok(shadowObjects.some((o) => { const [sx, sy] = vec(o.position); return Math.hypot(sx - p[0], sy - p[1]) < 80; }), `${what} has no circle shadow`);
  }

  // the shadow paths sit above every pattern; the circles are objects on the lowest layer, so no pattern on a higher layer may bury one
  ok(lv.paths.every((p) => p.layer > Math.max(...lv.patterns.map((q) => q.layer))), 'a shadow path must sit above every pattern');
  const above = lv.patterns.filter((p) => p.layer > SHADOW_LAYER).map((p) => pool(p.points));
  const buriedAt = (q) => above.some((poly) => pointInPolygon(q, poly));
  let buried = 0;
  for (const o of shadowObjects) {
    const [x, y] = vec(o.position), radius = (512 * vec(o.scale)[0]) / 2;
    for (let dx = -radius; dx <= radius; dx += 64) { for (let dy = -radius; dy <= radius; dy += 64) { if (Math.hypot(dx, dy) <= radius && buriedAt([x + dx, y + dy])) { buried++; } } }
  }
  ok(buried === 0, `${buried} shadow samples lie under a pattern on a higher layer and would be hidden`);
}

// 6. nodes
checkNodes(ok, map, { S, margin: 300 });
finish();
