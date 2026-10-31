import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INDEX_DIR, REPO_DIR } from '../config.mjs';
import { COLS, ROWS, S } from '../maps/grappa-safehouse/grid.mjs';
import { CLUTTER_CUTS, LAYER, composeScene } from '../maps/grappa-safehouse/scene.mjs';
import { wallStretches } from '../maps/grappa-safehouse/structure.mjs';

const JSON_FILE = path.join(REPO_DIR, 'output', 'maps', 'grappa-safehouse.json');
const haveInputs = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv')) && fs.existsSync(JSON_FILE);
const json = haveInputs ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : null;
const scene = haveInputs ? composeScene(json) : null;
const isShadow = (o) => o.pack === '[BW] Baileywiki Shadows';

test('the scene covers the extended 19 x 16 map', { skip: !haveInputs }, () => {
  assert.deepEqual(scene.world, { cols: COLS, rows: ROWS, size: S });
  assert.equal(COLS, 19);
  assert.equal(ROWS, 16);
  assert.equal(scene.walls.length, 4);
  assert.equal(scene.walls.reduce((n, w) => n + w.openings.length, 0), 15);
});

test('mapping rule 1: every prop is scaled 0.8 to 1.2 and none is a colorable texture', { skip: !haveInputs }, () => {
  const placed = scene.objects.filter((o) => !isShadow(o));
  assert.ok(placed.length > 150);
  assert.ok(placed.every((o) => o.scale >= 0.8 - 1e-9 && o.scale <= 1.2 + 1e-9), 'scale range');
  assert.ok(scene.objects.every((o) => !/x\.png$/.test(o.rel) || isShadow(o)), 'no colorable x-variants');
});

test('the standing clutter calibration is applied exactly', { skip: !haveInputs }, () => {
  const density = CLUTTER_CUTS.reduce((d, cut) => d * (1 - cut), 1);
  assert.equal(scene.stats.clutter, Math.round(scene.stats.clutterPlaced * density));
  const uncut = composeScene(json, { clutterCuts: [] });
  assert.equal(uncut.stats.clutter, uncut.stats.clutterPlaced);
  assert.equal(uncut.stats.clutterPlaced, scene.stats.clutterPlaced, 'the cuts thin the layout, they do not change what is placed');
});

test('shadows are composed last: changing the clutter cuts never moves a prop', { skip: !haveInputs }, () => {
  const uncut = composeScene(json, { clutterCuts: [] });
  const bigProps = (s) => s.objects.filter((o) => o.layer !== LAYER.clutter && o.layer !== LAYER.shadow);
  assert.equal(bigProps(uncut).length, bigProps(scene).length);
  assert.deepEqual(bigProps(uncut), bigProps(scene));
  assert.deepEqual(uncut.paths, scene.paths);
});

test('every standing stretch of every wall has a half shadow along it, fading to the open side', { skip: !haveInputs }, () => {
  const wallShadows = scene.paths.filter((p) => p.role === 'wall');
  const stretches = scene.structure.walls.flatMap((w) => wallStretches(w));
  assert.equal(wallShadows.length, stretches.length);
  stretches.forEach(([a, b], i) => {
    assert.deepEqual(wallShadows[i].points, [a, b], 'same line, same direction, so the left-of-travel fade lands on the open side');
    assert.match(wallShadows[i].name, /^BW_Half_Shadow_Large_0(50|75)$/);
  });
  const outerSouth = wallShadows.filter(({ points: [a, b] }) => a[1] === 14 * S && b[1] === 14 * S);
  assert.ok(outerSouth.length === 2 && outerSouth.every(({ points: [a, b] }) => b[0] < a[0]), 'the south face is shaded outwards: it runs west, so the fade lies to the south, in the corridor');
});

test('where wall mass meets the floor a tight contact shadow falls on the floor side', { skip: !haveInputs }, () => {
  const mass = scene.paths.filter((p) => p.role === 'mass');
  assert.equal(mass.length, scene.stats.massShadows);
  assert.ok(mass.length >= 20);
  for (const p of mass) {
    const [a, b] = p.points, len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const left = [d[1], -d[0]];
    const mid = [(a[0] + b[0]) / 2 + left[0] * 40, (a[1] + b[1]) / 2 + left[1] * 40];
    const cell = `${Math.floor(mid[0] / S) + 1},${Math.floor(mid[1] / S) + 1}`;
    assert.ok(scene.structure.floorCells.has(cell), `the fade of ${p.name} at ${mid} must lie on a floor square, not on wall mass`);
    assert.match(p.name, /^BW_Half_Shadow_Small_050$/);
  }
});

test('the grid\'s cover squares carry props and the difficult squares are densely cluttered', { skip: !haveInputs }, () => {
  const inSquare = (o, c, r) => o.x >= (c - 1) * S && o.x < c * S && o.y >= (r - 1) * S && o.y < r * S;
  for (const [c, r] of [...json.terrain.machine, ...json.terrain.bench]) {
    assert.ok(scene.objects.some((o) => [LAYER.furniture, LAYER.onTop, LAYER.tall].includes(o.layer) && Math.hypot(o.x - (c - 0.5) * S, o.y - (r - 0.5) * S) < 190), `cover square (${c},${r})`);
  }
  const clutter = scene.objects.filter((o) => o.layer === LAYER.clutter);
  for (const [c, r] of json.terrain.scrap) { assert.ok(clutter.filter((o) => inSquare(o, c, r)).length >= 3, `difficult square (${c},${r})`); }
});

test('the doorways stay clear: front doors, rear door, and the corridor in front of them', { skip: !haveInputs }, () => {
  const blockers = scene.objects.filter((o) => o.layer >= LAYER.furniture && o.layer < LAYER.aboveWalls && !isShadow(o));
  const inBox = (o, x0, y0, x1, y1) => o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1;
  assert.deepEqual(blockers.filter((o) => inBox(o, 6 * S + 20, 14 * S, 10 * S - 20, 15 * S)), [], 'front doors');
  assert.deepEqual(blockers.filter((o) => inBox(o, 16 * S - 60, 2 * S + 20, 16 * S + 100, 4 * S - 20)), [], 'rear doorway');
});

test('the street and corridor are dressed: wagon at the back door, lamps, trough, flanking wall lamps', { skip: !haveInputs }, () => {
  const named = (re) => scene.objects.filter((o) => re.test(o.name));
  const [wagon, ...extra] = named(/^caravan_3a$/);
  assert.ok(wagon && extra.length === 0);
  assert.ok(wagon.x > 16 * S && wagon.x < 19 * S && wagon.y > 2 * S && wagon.y < 6 * S);
  assert.ok(named(/^lamp_1[abc]$/).length === 3 && named(/^lamp_1[abc]$/).every((o) => o.x > 16 * S && o.x < 19 * S));
  assert.equal(named(/^trough_1a$/).length, 1);
  assert.ok(named(/^Lantern_Wall_0[12]$/).filter((o) => o.y > 14 * S).length >= 5);
});

test('composition is deterministic for a seed and varies with another', { skip: !haveInputs }, () => {
  assert.deepEqual(composeScene(json).objects, scene.objects);
  assert.notDeepEqual(composeScene(json, { seed: 7 }).objects, scene.objects);
});

test('the user\'s shadow-path rule: paths on layer 400 above the props, no prop on 400, circles under everything', { skip: !haveInputs }, () => {
  assert.equal(LAYER.shadowPath, 400);
  assert.ok(scene.paths.length > 0 && scene.paths.every((p) => p.layer === 400));
  const placed = scene.objects.filter((o) => !isShadow(o));
  assert.ok(placed.every((o) => o.layer < 400 || o.layer >= LAYER.aboveWalls), 'no prop shares the shadow-path layer');
  const circles = scene.objects.filter(isShadow);
  assert.equal(circles.length, scene.stats.propShadows);
  assert.ok(circles.every((o) => o.layer === LAYER.shadow && o.layer < Math.min(...placed.map((p) => p.layer))));
});
