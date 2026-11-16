import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_DIR } from '../config.mjs';
import { COLS, LABEL, ROWS, S, parseGrid } from '../maps/cauldron-hill-entrance/grid.mjs';
import { chainRuns, deriveStructure } from '../maps/cauldron-hill-entrance/structure.mjs';

const HTML_FILE = path.join(REPO_DIR, 'output', 'maps', 'cauldron-hill-entrance.html');
const have = fs.existsSync(HTML_FILE);
const grid = have ? parseGrid(fs.readFileSync(HTML_FILE, 'utf8')) : null;
const structure = have ? deriveStructure(grid) : null;

test('the grid is the 40 x 28 encounter with a height on every square', { skip: !have }, () => {
  assert.equal(COLS, 40);
  assert.equal(ROWS, 28);
  assert.equal(grid.cells.size, 40 * 28);
  assert.equal(grid.at(20, 5).h, 0);
  assert.equal(grid.at(10, 3).h, 10, 'ledges are +10');
  assert.equal(grid.at(4, 6).kind, 'ramp');
  assert.equal(grid.at(4, 6).h, 5, 'the worn ascent is +5');
  assert.equal(grid.of('tree').length, 34);
  assert.equal(grid.of('gate').length, 8);
});

test('a page that is not the 40 x 28 grid is refused', () => {
  const cell = (c, r) => `<td title="Column ${c}, row ${r}: Open ground" data-height="0">.</td>`;
  const small = Array.from({ length: 9 }, (_, i) => cell((i % 3) + 1, Math.floor(i / 3) + 1)).join('');
  assert.throws(() => parseGrid(small), /Expected the 40 x 28 encounter grid/);
});

test('rooms are found by flood fill: lobby with the tunnel, mechanism room, guard room and three shacks', { skip: !have }, () => {
  const count = (name) => [...structure.roomOf.values()].filter((r) => r === name).length;
  assert.equal(count('lobby'), 4 * 3 + 2 * 3, 'the lobby (4 x 3) plus the 2-wide tunnel running north');
  assert.equal(count('mech'), 3 * 3);
  assert.equal(count('guard'), 3 * 3);
  assert.equal(count('shackA'), 5 * 4);
  assert.equal(count('shackB'), 3 * 3);
  assert.equal(count('shackE'), 5 * 4);
  assert.equal(structure.classOf(20, 7), 'ground', 'the closed steel gate separates the lobby from the apron');
  assert.equal(structure.classOf(10, 3), 'ledge');
  assert.equal(structure.classOf(29, 9), 'rock', 'the trench core is solid rock');
  assert.equal(structure.classOf(27, 9), 'trench');
});

test('every height change outside the buildings is a cliff, broken only by the two worn ascents', { skip: !have }, () => {
  const lines = structure.cliffs.map((c) => `${c.vertical ? 'v' : 'h'}:${c.line}:${c.from}-${c.to}:${c.drop}`);
  assert.deepEqual([...lines].sort(), [
    `h:${6 * S}:0-${3 * S}:10`,
    `h:${6 * S}:${5 * S}-${15 * S}:10`,
    `h:${6 * S}:${25 * S}-${35 * S}:10`,
    `h:${6 * S}:${37 * S}-${40 * S}:10`,
    `v:${3 * S}:${5 * S}-${6 * S}:5`,
    `v:${5 * S}:${5 * S}-${6 * S}:5`,
    `v:${35 * S}:${5 * S}-${6 * S}:5`,
    `v:${37 * S}:${5 * S}-${6 * S}:5`,
  ].sort());
  assert.equal(structure.ramps.length, 2);
  for (const ramp of structure.ramps) { assert.equal(ramp.c2 - ramp.c1 + 1, 2, 'each ascent is two squares wide'); }
  // the high side of a cliff is the ledge: the normal of the facade cliffs points north
  for (const c of structure.cliffs.filter((x) => !x.vertical)) { assert.deepEqual(c.n, [0, -1]); }
});

test('walls: the facade is one steel wall with a four-square gate, the two interior doors and the shack doorways are openings', { skip: !have }, () => {
  const steel = structure.walls.filter((w) => w.material === 'steel');
  const facade = steel.find((w) => w.points.some((p) => p[1] === 6 * S && p[0] === 15 * S));
  assert.ok(facade, 'a steel wall runs along the south edge of the foyer');
  const gate = facade.openings.filter((o) => o[1] === 6 * S).map((o) => o[0] / S);
  assert.deepEqual(gate.sort((a, b) => a - b), [18.5, 19.5, 20.5, 21.5], 'four doorway squares for the 20 ft gate (columns 19 to 22)');
  assert.equal(structure.walls.filter((w) => w.material === 'timber').length, 3, 'three shack outlines');
  assert.equal(structure.walls.filter((w) => w.material === 'stone').length, 2, 'the trench cut and the rock core loop');
  const partitions = structure.walls.filter((w) => w.partition);
  assert.equal(partitions.length, 2, 'the lobby partitions run into the shell');
  for (const w of partitions) { assert.equal(w.openings.length, 1, 'each carries its interior door'); }
});

test('the tunnel runs on north off the map: its door-only end draws no wall', { skip: !have }, () => {
  const tops = structure.lines.filter((l) => l.horizontal && l.fixed === 0);
  assert.equal(tops.length, 0);
});

test('chainRuns joins corners of one material, stops at three-way junctions, and closes loops', () => {
  const run = (a, b, material = 'steel') => ({ material, partition: false, points: [a, b], openings: [] });
  // an L: one polyline
  const l = chainRuns([run([0, 0], [10, 0]), run([10, 0], [10, 10])]);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].points, [[0, 0], [10, 0], [10, 10]]);
  // a T: three runs meet at (10, 0), so each keeps its own end
  const t = chainRuns([run([0, 0], [10, 0]), run([10, 0], [20, 0]), run([10, 0], [10, 10])]);
  assert.equal(t.length, 3);
  // different materials never join
  assert.equal(chainRuns([run([0, 0], [10, 0], 'steel'), run([10, 0], [10, 10], 'timber')]).length, 2);
  // a closed square comes back as one polyline starting and ending at the same point
  const loop = chainRuns([run([0, 0], [10, 0]), run([10, 0], [10, 10]), run([10, 10], [0, 10]), run([0, 10], [0, 0])]);
  assert.equal(loop.length, 1);
  assert.equal(loop[0].points.length, 5);
  assert.deepEqual(loop[0].points[0], loop[0].points[4]);
});

test('the legend of terrain labels is complete', () => {
  assert.equal(Object.keys(LABEL).length, 16);
});
