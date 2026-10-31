import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveStructure } from '../maps/dockyard-warehouse/structure.mjs';

// The dockyard encounter's ring: wall squares 4-15 x 2-11 with three 2-wide doorways (west, east, south).
const grid = { ring: { c1: 4, c2: 15, r1: 2, r2: 11 }, doorCells: [[4, 8], [4, 9], [15, 8], [15, 9], [7, 11], [8, 11]] };
const st = deriveStructure(grid);

test('shadow runs: the outer wall line is shaded outdoors and the inner edge indoors, both broken at every doorway', () => {
  const { outer, inner } = st.shadowRuns;
  // Doorway gaps along the wall: west and east y 1792-2304, south x 1536-2048. The outer line runs clockwise on screen.
  assert.deepEqual(outer, [
    [[768, 256], [3840, 256]], // top, whole
    [[3840, 256], [3840, 1792]], [[3840, 2304], [3840, 2816]], // east, either side of the doors
    [[3840, 2816], [2048, 2816]], [[1536, 2816], [768, 2816]], // south, either side of the doors
    [[768, 2816], [768, 2304]], [[768, 1792], [768, 256]], // west, either side of the doors
  ]);
  // The contact shade runs the same wall line the other way round (counter-clockwise), so its fade lies onto the floor inside.
  assert.deepEqual(inner, outer.map(([from, to]) => [to, from]));
});

test('shadow runs: left of travel points away from the building outdoors and into it indoors (BW half shadows fade to the left)', () => {
  const centre = [(st.outerRect.x0 + st.outerRect.x1) / 2, (st.outerRect.y0 + st.outerRect.y1) / 2];
  const leftDot = ([a, b]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const left = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len]; // screen y points down
    const mid = [(a[0] + b[0]) / 2 - centre[0], (a[1] + b[1]) / 2 - centre[1]];
    return left[0] * mid[0] + left[1] * mid[1];
  };
  assert.ok(st.shadowRuns.outer.every((run) => leftDot(run) > 0), 'outer runs fade outdoors');
  assert.ok(st.shadowRuns.inner.every((run) => leftDot(run) < 0), 'inner runs fade into the room');
});

test('shadow runs sit on grid lines and leave every doorway unshaded, outdoors and in', () => {
  const onRun = (run, [x, y]) => {
    const [[ax, ay], [bx, by]] = run;
    return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by) && (ax === bx ? x === ax : y === ay);
  };
  for (const run of [...st.shadowRuns.outer, ...st.shadowRuns.inner]) {
    assert.ok(run.flat().every((v) => v % 256 === 0), `run ${run} sits on grid lines`);
  }
  for (const [x, y] of st.openings) {
    assert.ok(!st.shadowRuns.outer.some((run) => onRun(run, [x, y])), `outer shadow crosses the doorway at (${x}, ${y})`);
    assert.ok(!st.shadowRuns.inner.some((run) => onRun(run, [x, y])), `inner shadow crosses the doorway at (${x}, ${y})`);
  }
});
