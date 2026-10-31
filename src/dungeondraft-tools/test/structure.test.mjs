import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveStructure } from '../maps/dockyard-warehouse/structure.mjs';

// The dockyard encounter's ring: wall squares 4-15 x 2-11 with three 2-wide doorways (west, east, south).
const grid = { ring: { c1: 4, c2: 15, r1: 2, r2: 11 }, doorCells: [[4, 8], [4, 9], [15, 8], [15, 9], [7, 11], [8, 11]] };
const st = deriveStructure(grid);
const keys = (set) => [...set];

test('wall squares form the ring, and every one of them is walkable floor (there is no wall mass)', () => {
  assert.equal(st.wallSquares.size, 2 * (12 + 10) - 4);
  assert.equal(st.massCells, undefined, 'the masonry band no longer exists');
  assert.ok([...st.wallSquares].every((k) => st.floorCells.has(k)), 'every wall square is floor');
  for (const [c, r] of grid.doorCells) {
    assert.ok(st.wallSquares.has(`${c},${r}`) && st.floorCells.has(`${c},${r}`), `door (${c},${r}) is a wall square and floor`);
  }
});

test('the floor is the whole footprint inside the wall line: wall squares, doorways and room', () => {
  assert.equal(st.floorCells.size, 12 * 10);
  assert.ok(st.floorCells.has('4,2') && st.floorCells.has('15,11') && st.floorCells.has('5,3') && st.floorCells.has('14,10'), 'corners and room');
  assert.ok(!st.floorCells.has('3,2') && !st.floorCells.has('16,11') && !st.floorCells.has('4,12'), 'nothing past the wall line');
});

test('the wall is one clockwise loop on the OUTER edge of the wall squares', () => {
  assert.deepEqual(st.outerRect, { x0: 768, y0: 256, x1: 3840, y1: 2816 });
  assert.deepEqual(st.wallLine, [[768, 256], [3840, 256], [3840, 2816], [768, 2816]]);
  assert.deepEqual(st.room, st.outerRect, 'the floor reaches the wall line');
  assert.equal(st.roomEdge, undefined, 'there is no inner edge any more');
  assert.ok(st.wallLine.every(([x, y]) => x % 256 === 0 && y % 256 === 0), 'rule 5: the wall sits on grid lines');
});

test('each doorway is an opening on the wall line, centred on its door square', () => {
  assert.deepEqual(st.openings, [[768, 1920], [768, 2176], [3840, 1920], [3840, 2176], [1664, 2816], [1920, 2816]]);
});

test('the band covers every wall square once, in the order the random sequence depends on', () => {
  assert.equal(st.band.length, st.wallSquares.size);
  assert.equal(new Set(st.band.map(({ c, r }) => `${c},${r}`)).size, st.band.length);
  assert.deepEqual(st.band.slice(0, 5).map(({ c, r }) => [c, r]), [[4, 2], [4, 11], [5, 2], [5, 11], [6, 2]], 'top then bottom, column by column');
  assert.equal(st.band.filter((b) => b.corner).length, 4);
  assert.equal(st.band.filter((b) => b.door).length, grid.doorCells.length);
});

test('band cells face away from the building and turn props to match', () => {
  const at = (c, r) => st.band.find((b) => b.c === c && b.r === r);
  assert.deepEqual([at(8, 2).out, at(8, 2).rot], [[0, -1], 0]);
  assert.deepEqual([at(9, 11).out, at(9, 11).rot], [[0, 1], Math.PI]);
  assert.deepEqual([at(4, 5).out, at(4, 5).rot], [[-1, 0], -Math.PI / 2]);
  assert.deepEqual([at(15, 5).out, at(15, 5).rot], [[1, 0], Math.PI / 2]);
  for (const b of st.band.filter((x) => !x.corner)) {
    const outside = `${b.c + b.out[0]},${b.r + b.out[1]}`;
    assert.ok(!st.wallSquares.has(outside) && !st.floorCells.has(outside), `(${b.c},${b.r}) faces into the structure`);
  }
});

test('squares beside a doorway are flagged so they get a door lantern', () => {
  const flagged = (c, r) => st.band.find((b) => b.c === c && b.r === r).nextToDoor;
  assert.ok(flagged(4, 7) && flagged(4, 10) && flagged(6, 11) && flagged(9, 11) && flagged(15, 7) && flagged(15, 10));
  assert.ok(!flagged(4, 6) && !flagged(10, 11) && !flagged(8, 2));
});

test('door-side squares know which way the doorway lies along the wall', () => {
  const side = (c, r) => st.band.find((b) => b.c === c && b.r === r).doorward;
  assert.deepEqual([side(4, 7), side(4, 10), side(6, 11), side(9, 11), side(15, 7), side(15, 10), side(8, 2)], [-1, 1, -1, 1, 1, -1, 0]);
});

test('deriving twice gives the same structure (no shared mutable state)', () => {
  assert.deepEqual(deriveStructure(grid), st);
});
