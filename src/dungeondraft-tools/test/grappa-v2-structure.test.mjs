import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_DIR } from '../config.mjs';
import { COLS, LABEL, ROWS, S, blocksOf, parseGrid } from '../maps/grappa-safehouse-v2/grid.mjs';
import { deriveStructure } from '../maps/grappa-safehouse-v2/structure.mjs';

const DIR = path.join(REPO_DIR, 'output', 'encounters', 'grappav2');
const HTML_FILE = path.join(DIR, 'grappa-safehouse-v2.html');
const have = fs.existsSync(HTML_FILE);
const html = have ? fs.readFileSync(HTML_FILE, 'utf8') : '';
const deployment = have ? JSON.parse(fs.readFileSync(path.join(DIR, 'grappa-safehouse-v2.json'), 'utf8')).deployment : [];
const grid = have ? parseGrid(html, deployment) : null;
const structure = have ? deriveStructure(grid) : null;

test('the map is the 16 x 14 encounter plus a 2-row corridor south and a 4-column street east, numbering unchanged', { skip: !have }, () => {
  assert.equal(COLS, 20);
  assert.equal(ROWS, 16);
  assert.equal(grid.cells(LABEL.CORRIDOR).length, 16 * 2);
  assert.equal(grid.cells(LABEL.STREET).length, 4 * 16);
  assert.equal(grid.type['1,1'], LABEL.FLOOR);
  assert.equal(grid.type['4,5'], LABEL.LOW, 'the desk square keeps its encounter coordinates');
  assert.deepEqual(blocksOf(grid, LABEL.TALL).map((b) => [b.c1, b.c2, b.r1, b.r2]), [[2, 4, 1, 1], [12, 13, 2, 3], [7, 8, 11, 11], [1, 1, 4, 5]].sort((a, b) => a[2] - b[2] || a[0] - b[0]));
  assert.deepEqual(grid.ally, { x: 7, y: 5 });
});

test('a page that is not the 16 x 14 encounter grid is refused', () => {
  const cell = (c, r) => `<td title="Column ${c}, row ${r}: floor">.</td>`;
  const small = Array.from({ length: 9 }, (_, i) => cell((i % 3) + 1, Math.floor(i / 3) + 1)).join('');
  assert.throws(() => parseGrid(small), /Expected the 16 x 14 encounter grid/);
});

test('flood fill finds exactly the five areas, doorways dividing them', { skip: !have }, () => {
  const sizes = Object.fromEntries(structure.regions.map((r) => [r.name, r.cells.size]));
  assert.deepEqual(sizes, { records: 10 * 8, store: 6 * 8, common: 16 * 6, corridor: 16 * 2, street: 4 * 16 });
  assert.equal(structure.areaOf(7, 8), 'records');
  assert.equal(structure.areaOf(7, 9), 'common', 'the north-wall opening divides the records room from the common room');
  assert.equal(structure.areaOf(10, 5), 'records');
  assert.equal(structure.areaOf(11, 5), 'store', 'the connecting doors divide the two northern rooms');
  assert.equal(structure.areaOf(8, 14), 'common');
  assert.equal(structure.areaOf(8, 15), 'corridor', 'the front doors lead into the corridor');
  assert.equal(structure.areaOf(16, 4), 'store');
  assert.equal(structure.areaOf(17, 4), 'street', 'the rear doors let out into the street');
  assert.equal(structure.areaOf(0, 1), null);
});

test('the building outline is one polyline with its corners joined, open at the corridor\'s west end', { skip: !have }, () => {
  const outer = structure.walls.filter((w) => w.outer);
  assert.equal(outer.length, 1);
  // from the corridor's south-west corner round the east side and back down the west wall to the corridor's north side
  assert.deepEqual(outer[0].points, [[0, 4096], [4096, 4096], [4096, 0], [0, 0], [0, 3584]]);
  assert.equal(outer[0].openings.length, 2, 'the two rear doors are the only openings in the outside wall');
  const inner = structure.walls.filter((w) => !w.outer);
  assert.equal(inner.length, 3);
  assert.equal(inner.reduce((n, w) => n + w.openings.length, 0), 6 + 4 + 3);
  assert.ok(structure.walls.every((w) => w.points.every(([x, y]) => x % S === 0 && y % S === 0)), 'rule 5: every wall point is on a grid line');
});

test('standing stretches stop at doorways and each faces one room per side', { skip: !have }, () => {
  for (const line of structure.lines) {
    for (const stretch of line.stretches) {
      for (const [x, y] of line.openings) {
        const m = line.horizontal ? x : y;
        assert.ok(stretch.to <= m - S / 2 + 0.5 || stretch.from >= m + S / 2 - 0.5, 'a stretch runs across a doorway');
      }
    }
  }
  const east = structure.lines.find((l) => !l.horizontal && l.fixed === 16 * S).stretches;
  assert.deepEqual(east.map((s) => [s.from / S, s.to / S, s.sides[0].area, s.sides[1].area]), [
    [0, 2, 'store', 'street'], [4, 8, 'store', 'street'], [8, 14, 'common', 'street'], [14, 16, 'corridor', 'street'],
  ]);
});

test('wall rotation turns a mounting-edge-up prop to face its wall', { skip: !have }, () => {
  assert.ok(Math.abs(structure.wallRotation([0, 1])) < 1e-9);
  assert.ok(Math.abs(Math.abs(structure.wallRotation([0, -1])) - Math.PI) < 1e-9);
  assert.ok(Math.abs(structure.wallRotation([1, 0]) + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(structure.wallRotation([-1, 0]) - Math.PI / 2) < 1e-9);
});
