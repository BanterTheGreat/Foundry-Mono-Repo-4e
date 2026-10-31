import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_DIR } from '../config.mjs';
import { COLS, ROWS, S, parseGrid } from '../maps/grappa-safehouse/grid.mjs';
import { deriveStructure, wallStretches } from '../maps/grappa-safehouse/structure.mjs';

const json = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'output', 'maps', 'grappa-safehouse.json'), 'utf8'));
const grid = parseGrid(json);
const st = deriveStructure(grid);

test('the grid grows by three street columns on the east and two corridor rows on the south', () => {
  assert.equal(COLS, 19);
  assert.equal(ROWS, 16);
  assert.equal(grid.cells.size, 19 * 16);
  assert.equal(grid.of('street').length, 3 * 16);
  assert.equal(grid.of('corridor').length, 16 * 2);
  assert.equal(grid.at(17, 1).kind, 'street');
  assert.equal(grid.at(19, 16).kind, 'street', 'the corner belongs to the street');
  assert.equal(grid.at(1, 15).kind, 'corridor');
});

test('the original squares keep their numbers and terrain', () => {
  assert.equal(grid.at(1, 1).kind, 'wall');
  assert.equal(grid.at(16, 3).kind, 'door');
  assert.equal(grid.at(16, 4).kind, 'door');
  assert.equal(grid.at(7, 14).kind, 'door');
  assert.equal(grid.at(2, 2).kind, 'machine');
  assert.equal(grid.at(4, 5).kind, 'bench');
  assert.equal(grid.at(6, 6).kind, 'scrap');
  assert.equal(grid.at(8, 5).kind, 'floor');
  assert.equal(grid.of('door').length, 15);
});

test('three rooms are found and named', () => {
  assert.deepEqual(st.rooms.map((room) => room.name).sort(), ['common', 'records', 'store']);
  assert.ok(st.roomNamed('records').cells.has('2,2') && st.roomNamed('records').cells.has('9,7'));
  assert.ok(st.roomNamed('store').cells.has('11,2') && st.roomNamed('store').cells.has('15,7'));
  assert.ok(st.roomNamed('common').cells.has('2,9') && st.roomNamed('common').cells.has('15,13'));
  assert.equal(st.roomNamed('records').cells.size, 8 * 6);
  assert.equal(st.roomNamed('store').cells.size, 5 * 6);
  assert.equal(st.roomNamed('common').cells.size, 14 * 5);
});

test('masonry is every wall square, plank floor includes every doorway, and the two never overlap', () => {
  assert.equal(st.massCells.size, grid.of('wall').length);
  assert.ok([...st.doorKeys].every((k) => st.floorCells.has(k) && !st.massCells.has(k)));
  assert.ok([...st.massCells].every((k) => !st.floorCells.has(k)));
  assert.equal(st.floorCells.size, 48 + 30 + 70 + 15);
});

test('walls: the ring on its outer edge, one partition each way, and the neighbouring corridor wall', () => {
  const byId = Object.fromEntries(st.walls.map((w) => [w.id, w]));
  assert.deepEqual(Object.keys(byId).sort(), ['corridor', 'outer', 'partition-col-10', 'partition-row-8']);
  assert.deepEqual(byId.outer.points, [[0, 0], [16 * S, 0], [16 * S, 14 * S], [0, 14 * S]]);
  assert.equal(byId.outer.loop, true);
  assert.deepEqual(byId['partition-row-8'].points, [[16 * S, 8 * S], [0, 8 * S]]);
  assert.deepEqual(byId['partition-col-10'].points, [[10 * S, 0], [10 * S, 8 * S]]);
  assert.deepEqual(byId.corridor.points, [[0, 14 * S], [0, 16 * S], [16 * S, 16 * S]]);
  for (const w of st.walls) {
    const lines = w.points.every(([x, y], i, P) => {
      if (!w.loop && i === P.length - 1) { return x % S === 0 && y % S === 0; }
      const [x2, y2] = P[(i + 1) % P.length];
      return (x === x2 || y === y2) && x % S === 0 && y % S === 0;
    });
    assert.ok(lines, `${w.id} runs along grid lines`);
  }
});

test('every doorway is an opening on its wall, centred on the door square', () => {
  const byId = Object.fromEntries(st.walls.map((w) => [w.id, w]));
  assert.deepEqual(byId.outer.openings.map(([x, y]) => [x / S, y / S]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), [[6.5, 14], [7.5, 14], [8.5, 14], [9.5, 14], [16, 2.5], [16, 3.5]]);
  assert.deepEqual(byId['partition-row-8'].openings.map(([x, y]) => [x / S, y / S]), [[6.5, 8], [7.5, 8], [8.5, 8], [11.5, 8], [12.5, 8], [13.5, 8]]);
  assert.deepEqual(byId['partition-col-10'].openings.map(([x, y]) => [x / S, y / S]), [[10, 3.5], [10, 4.5], [10, 5.5]]);
  assert.equal(byId.corridor.openings.length, 0);
  const total = st.walls.reduce((n, w) => n + w.openings.length, 0);
  assert.equal(total, st.doorCells.length);
});

test('a half shadow fades to the left of travel, so every wall is ordered with its open side on the left', () => {
  const left = ([ax, ay], [bx, by]) => { const l = Math.hypot(bx - ax, by - ay); return [(by - ay) / l + 0, -(bx - ax) / l + 0]; }; // + 0 turns -0 into 0
  const byId = Object.fromEntries(st.walls.map((w) => [w.id, w]));
  // outer ring: outside is on the left of every clockwise segment
  const P = byId.outer.points;
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length];
    const [lx, ly] = left(a, b);
    const mid = [(a[0] + b[0]) / 2 + lx * 100, (a[1] + b[1]) / 2 + ly * 100];
    const inside = mid[0] > 0 && mid[0] < 16 * S && mid[1] > 0 && mid[1] < 14 * S;
    assert.ok(!inside, `outer segment ${i} shades outwards`);
  });
  assert.deepEqual(left(...byId['partition-row-8'].points), [0, 1], 'the horizontal partition shades south');
  assert.deepEqual(left(...byId['partition-col-10'].points), [1, 0], 'the vertical partition shades east');
  const c = byId.corridor.points;
  assert.deepEqual(left(c[0], c[1]), [1, 0], 'the corridor west end shades east');
  assert.deepEqual(left(c[1], c[2]), [0, -1], 'the corridor south wall shades north');
});

test('wall stretches stop at doorways', () => {
  const outer = st.walls.find((w) => w.id === 'outer');
  const stretches = wallStretches(outer);
  // north edge whole; east edge split around the two rear-door squares; south edge split around the four front doors; west whole
  assert.equal(stretches.length, 1 + 2 + 2 + 1);
  const east = stretches.filter(([a, b]) => a[0] === 16 * S && b[0] === 16 * S);
  assert.deepEqual(east.map(([a, b]) => [a[1] / S, b[1] / S]), [[0, 2], [4, 14]]);
  const south = stretches.filter(([a, b]) => a[1] === 14 * S && b[1] === 14 * S);
  assert.deepEqual(south.map(([a, b]) => [a[0] / S, b[0] / S]), [[16, 10], [6, 0]]);
  for (const w of st.walls.filter((x) => x.id !== 'outer')) {
    const total = wallStretches(w).reduce((n, [a, b]) => n + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    const full = w.points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - w.points[i][0], p[1] - w.points[i][1]), 0);
    assert.ok(Math.abs(total - (full - w.openings.length * S)) < 1, `${w.id} loses exactly one square per opening`);
  }
});

test('the wall mass band covers every wall square once and turns props towards their wall line', () => {
  assert.equal(st.band.length, st.wallSquares.size);
  assert.equal(new Set(st.band.map(({ c, r }) => `${c},${r}`)).size, st.band.length);
  const at = (c, r) => st.band.find((b) => b.c === c && b.r === r);
  assert.deepEqual([at(5, 1).out, at(5, 1).rot], [[0, -1], 0]);
  assert.deepEqual([at(12, 14).out, at(12, 14).rot], [[0, 1], Math.PI]);
  assert.deepEqual([at(1, 6).out, at(1, 6).rot], [[-1, 0], -Math.PI / 2]);
  assert.deepEqual([at(16, 8).out, at(16, 8).rot], [[1, 0], Math.PI / 2]);
  assert.deepEqual([at(4, 8).out, at(4, 8).rot], [[0, 1], Math.PI], 'row 8 is backed by the south-edge line');
  assert.deepEqual([at(10, 3).out, at(10, 3).rot], [[1, 0], Math.PI / 2], 'column 10 is backed by the east-edge line');
  assert.ok(at(10, 8).corner, 'where the two partitions meet');
  assert.equal(st.band.filter((b) => b.corner && b.ring).length, 4);
  assert.ok(at(6, 14).nextToDoor && at(11, 14).nextToDoor && at(16, 2).nextToDoor && at(16, 5).nextToDoor);
  assert.ok(!at(5, 14).nextToDoor);
});

test('the outdoor zones tile the new squares', () => {
  const { pavement, road, corridor } = st.zones;
  assert.deepEqual(pavement, { x0: 16 * S, y0: 0, x1: 17 * S, y1: 16 * S });
  assert.deepEqual(road, { x0: 17 * S, y0: 0, x1: 19 * S, y1: 16 * S });
  assert.deepEqual(corridor, { x0: 0, y0: 14 * S, x1: 16 * S, y1: 16 * S });
});

test('a layout the interpretation cannot draw is refused', () => {
  const bad = JSON.parse(JSON.stringify(json));
  bad.terrain.wall.push([8, 5]); // a lone wall square in the middle of a room
  assert.throws(() => deriveStructure(parseGrid(bad)), /not part of the ring/);
  const gap = JSON.parse(JSON.stringify(json));
  gap.terrain.bench.push([3, 1]); // furniture where the outer wall should be
  assert.throws(() => deriveStructure(parseGrid(gap)), /gap/);
});

test('deriving twice gives the same structure', () => {
  assert.deepEqual(deriveStructure(parseGrid(json)).walls, st.walls);
});
