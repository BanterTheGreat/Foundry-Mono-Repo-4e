import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEdgeData, parseEdgeGrid } from '../lib/edge-grid.mjs';

const S = 256;
/** A page of cells: `cells` maps "c,r" to [terrain, walls, doors]; everything not listed is open ground. */
function page(cols, rows, cells = {}) {
  const out = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const [terrain = 'Open ground', walls, doors] = cells[`${c},${r}`] ?? [];
      out.push(`<td title="Column ${c}, row ${r}: ${terrain}"${walls ? ` data-walls="${walls}"` : ''}${doors ? ` data-doors="${doors}"` : ''}>.</td>`);
    }
  }
  return `<table>${out.join('')}</table>`;
}

/** A closed 2 x 2 room: every boundary edge walled, written on the edge cell only. */
const room = () => page(2, 2, {
  '1,1': ['Open ground', 'N,W'], '2,1': ['Open ground', 'N,E'],
  '1,2': ['Open ground', 'S,W'], '2,2': ['Open ground', 'S,E'],
});

test('hasEdgeData tells the edge format from the older whole-square grids', () => {
  assert.equal(hasEdgeData(room()), true);
  assert.equal(hasEdgeData(page(2, 2)), false);
  assert.equal(hasEdgeData('<td title="Column 1, row 1: Warehouse wall">W</td>'), false);
});

test('cells, terrain and sides are read, and the grid size is the largest column and row', () => {
  const grid = parseEdgeGrid(page(3, 2, { '2,1': ['Rubble', 'N,E', 'S'], '3,1': ['Open ground', 'W'], '2,2': ['Open ground', '', 'N'] }));
  assert.equal(grid.cols, 3);
  assert.equal(grid.rows, 2);
  assert.equal(grid.size, 256);
  assert.equal(grid.cells.size, 6);
  const c = grid.cells.get('2,1');
  assert.equal(c.terrain, 'Rubble');
  assert.deepEqual([...c.walls].sort(), ['E', 'N']);
  assert.deepEqual([...c.doors], ['S']);
});

test('a creature id appended to the title is not part of the terrain', () => {
  const grid = parseEdgeGrid('<td title="Column 1, row 1: Open ground, A.1">A.1</td>');
  assert.equal(grid.cells.get('1,1').terrain, 'Open ground');
});

test('a closed room is eight distinct edges merged into one run per side', () => {
  const grid = parseEdgeGrid(room());
  assert.equal(grid.edges.length, 8);
  assert.equal(grid.edges.every((e) => e.kind === 'wall'), true);
  assert.deepEqual(grid.lines.map((l) => l.points), [
    [[0, 0], [2 * S, 0]], [[0, 2 * S], [2 * S, 2 * S]], // top, bottom
    [[0, 0], [0, 2 * S]], [[2 * S, 0], [2 * S, 2 * S]], // left, right
  ]);
  assert.equal(grid.lines.every((l) => l.openings.length === 0), true);
});

test('a shared edge is written on both neighbours and counted once', () => {
  const grid = parseEdgeGrid(page(2, 1, { '1,1': ['Open ground', 'E'], '2,1': ['Open ground', 'W'] }));
  assert.equal(grid.edges.length, 1);
  assert.deepEqual(grid.edges[0], { kind: 'wall', horizontal: false, x1: S, y1: 0, x2: S, y2: S });
  assert.deepEqual(grid.lines, [{ horizontal: false, points: [[S, 0], [S, S]], openings: [] }]);
});

test('a door stays inside its wall run as an opening at the edge midpoint', () => {
  // top wall of a 3-wide room with a door in the middle square
  const grid = parseEdgeGrid(page(3, 1, { '1,1': ['Open ground', 'N'], '2,1': ['Open ground', '', 'N'], '3,1': ['Open ground', 'N'] }));
  assert.equal(grid.edges.length, 3);
  assert.equal(grid.lines.length, 1, 'one continuous wall: the doorway is a portal on it, not a break');
  assert.deepEqual(grid.lines[0].points, [[0, 0], [3 * S, 0]]);
  assert.deepEqual(grid.lines[0].openings, [{ x: 1.5 * S, y: 0 }]);
});

test('a door on a vertical edge opens at its midpoint', () => {
  const grid = parseEdgeGrid(page(1, 2, { '1,1': ['Open ground', 'W'], '1,2': ['Open ground', '', 'W'] }));
  assert.deepEqual(grid.lines[0].points, [[0, 0], [0, 2 * S]]);
  assert.deepEqual(grid.lines[0].openings, [{ x: 0, y: 1.5 * S }]);
});

test('edges that only touch at a corner stay separate runs; a gap in a line splits it', () => {
  const corner = parseEdgeGrid(page(2, 2, { '1,1': ['Open ground', 'N,W'] }));
  assert.equal(corner.lines.length, 2);
  const gap = parseEdgeGrid(page(3, 1, { '1,1': ['Open ground', 'N'], '3,1': ['Open ground', 'N'] }));
  assert.deepEqual(gap.lines.map((l) => l.points), [[[0, 0], [S, 0]], [[2 * S, 0], [3 * S, 0]]]);
});

test('runs come out in a stable order: horizontal lines top to bottom, then vertical lines left to right', () => {
  const grid = parseEdgeGrid(page(2, 2, { '2,2': ['Open ground', 'S,E'], '1,1': ['Open ground', 'N,W'] }));
  assert.deepEqual(grid.lines.map((l) => [l.horizontal, l.points[0]]), [[true, [0, 0]], [true, [S, 2 * S]], [false, [0, 0]], [false, [2 * S, S]]]);
});

test('a shared edge written on only one neighbour is an error naming both cells', () => {
  assert.throws(() => parseEdgeGrid(page(2, 1, { '1,1': ['Open ground', 'E'] })), /Column 1, row 1: wall on side E is not written as a wall on side W of column 2, row 1/);
  assert.throws(() => parseEdgeGrid(page(2, 1, { '2,1': ['Open ground', 'W'] })), /Column 2, row 1: wall on side W is not written as a wall on side E of column 1, row 1/);
});

test('a shared edge that is a wall on one side and a door on the other is an error', () => {
  assert.throws(() => parseEdgeGrid(page(2, 1, { '1,1': ['Open ground', 'E'], '2,1': ['Open ground', '', 'W'] })), /not written as a wall/);
});

test('a bad compass letter, a repeated side, or a side that is both wall and door is an error', () => {
  assert.throws(() => parseEdgeGrid(page(1, 1, { '1,1': ['Open ground', 'X'] })), /"X" in data-walls is not a compass side/);
  assert.throws(() => parseEdgeGrid(page(1, 1, { '1,1': ['Open ground', 'N,N'] })), /lists a side twice/);
  assert.throws(() => parseEdgeGrid(page(1, 1, { '1,1': ['Open ground', 'N', 'N'] })), /both a wall and a door/);
});

test('lower-case letters and spaces are accepted in the attributes', () => {
  const grid = parseEdgeGrid('<td title="Column 1, row 1: Open ground" data-walls="n, w"></td>');
  assert.deepEqual([...grid.cells.get('1,1').walls].sort(), ['N', 'W']);
});

test('missing, duplicate or absent cells are an error', () => {
  assert.throws(() => parseEdgeGrid('<p>no grid</p>'), /No cells/);
  const missing = page(2, 2).replace(/<td title="Column 2, row 2[^>]*>.<\/td>/, '');
  assert.throws(() => parseEdgeGrid(missing), /Expected 4 cells for a 2 x 2 grid, found 3/);
  assert.throws(() => parseEdgeGrid(page(1, 1) + page(1, 1)), /Column 1, row 1 appears twice/);
});

test('the square size scales every coordinate', () => {
  const grid = parseEdgeGrid(page(2, 1, { '1,1': ['Open ground', 'N'], '2,1': ['Open ground', 'N'] }), { size: 100 });
  assert.deepEqual(grid.lines[0].points, [[0, 0], [200, 0]]);
});
