import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blob, chooseRemovals, decompose, locateOnPolyline, pointInPolygon, rectPolygon, seededRandom } from '../lib/geometry.mjs';

test('seededRandom is deterministic per seed, differs between seeds, and stays in [0, 1)', () => {
  const a = seededRandom(42), b = seededRandom(42), c = seededRandom(43);
  const first = Array.from({ length: 50 }, () => a());
  assert.deepEqual(Array.from({ length: 50 }, () => b()), first);
  assert.notDeepEqual(Array.from({ length: 50 }, () => c()), first);
  assert.ok(first.every((v) => v >= 0 && v < 1));
});

test('decompose covers a cell set exactly once with disjoint rectangles', () => {
  const keys = new Set();
  // an L shape with a notch: a 5x3 block plus a 2x4 tail, minus one interior cell
  for (let c = 1; c <= 5; c++) { for (let r = 1; r <= 3; r++) { keys.add(`${c},${r}`); } }
  for (let c = 1; c <= 2; c++) { for (let r = 4; r <= 7; r++) { keys.add(`${c},${r}`); } }
  keys.delete('3,2');
  const rects = decompose(keys, 8, 8);
  const covered = new Map();
  for (const { c1, r1, c2, r2 } of rects) {
    assert.ok(c2 >= c1 && r2 >= r1);
    for (let c = c1; c <= c2; c++) { for (let r = r1; r <= r2; r++) { covered.set(`${c},${r}`, (covered.get(`${c},${r}`) || 0) + 1); } }
  }
  assert.deepEqual([...covered.keys()].sort(), [...keys].sort());
  assert.ok([...covered.values()].every((n) => n === 1), 'no cell is covered twice');
});

test('pointInPolygon handles concave shapes and the notches of a tabbed floor', () => {
  const tabbed = [[1024, 512], [3584, 512], [3584, 1792], [3840, 1792], [3840, 2304], [3584, 2304], [3584, 2560], [1024, 2560]];
  assert.ok(pointInPolygon([2000, 1500], tabbed), 'room interior');
  assert.ok(pointInPolygon([3700, 2000], tabbed), 'inside the east tab');
  assert.ok(!pointInPolygon([3700, 1000], tabbed), 'in the wall above the east tab');
  assert.ok(!pointInPolygon([500, 500], tabbed), 'outside');
});

test('blob is a deterministic, closed-looking outline that stays near its ellipse', () => {
  const make = () => blob(seededRandom(7), 500, 400, 200, 120, { n: 16, jitter: 0.28 });
  const pts = make();
  assert.deepEqual(make(), pts);
  assert.equal(pts.length, 16);
  for (const [x, y] of pts) {
    const d = Math.hypot((x - 500) / 200, (y - 400) / 120);
    assert.ok(d > 0.4 && d < 1.7, `vertex (${x}, ${y}) at ${d.toFixed(2)} of the radius`);
  }
  assert.ok(new Set(pts.map(([x, y]) => Math.hypot((x - 500) / 200, (y - 400) / 120).toFixed(2))).size > 8, 'edges wander');
});

test('locateOnPolyline finds segment index and fraction, including a loop closing segment', () => {
  const square = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
  const east = locateOnPolyline(square, true, 1000, 250);
  assert.equal(east.index, 1);
  assert.ok(Math.abs(east.t - 0.25) < 1e-9 && east.dist < 1e-9);
  assert.deepEqual(east.direction, [0, 1]);
  const closing = locateOnPolyline(square, true, 0, 750);
  assert.equal(closing.index, 3, 'last point back to the first is the final segment');
  assert.ok(Math.abs(closing.t - 0.25) < 1e-9);
  const open = locateOnPolyline(square, false, 0, 750);
  assert.ok(open.dist > 100, 'an open polyline has no closing segment');
});

test('rectPolygon is clockwise from the top-left', () => {
  assert.deepEqual(rectPolygon(0, 0, 10, 5), [[0, 0], [10, 0], [10, 5], [0, 5]]);
});

test('chooseRemovals leaves exactly round(n * keep) items, whatever the placement randomness did', () => {
  const items = Array.from({ length: 167 }, (_, i) => ({ i }));
  for (const keep of [1, 0.85, 0.7225, 0.5, 0.1, 0]) {
    const removed = chooseRemovals(items, keep, seededRandom(11));
    assert.equal(items.length - removed.size, Math.round(items.length * keep), `keep ${keep}`);
    assert.ok([...removed].every((item) => items.includes(item)));
  }
});

test('chooseRemovals cuts nest: a deeper cut removes everything a shallower cut removed', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ i }));
  const shallow = chooseRemovals(items, 0.85, seededRandom(5));
  const deep = chooseRemovals(items, 0.7225, seededRandom(5));
  assert.ok(deep.size > shallow.size);
  assert.ok([...shallow].every((item) => deep.has(item)));
});

test('chooseRemovals is deterministic per seed and varies between seeds', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ i }));
  const ids = (set) => [...set].map((item) => item.i).sort((a, b) => a - b).join(',');
  assert.equal(ids(chooseRemovals(items, 0.8, seededRandom(1))), ids(chooseRemovals(items, 0.8, seededRandom(1))));
  assert.notEqual(ids(chooseRemovals(items, 0.8, seededRandom(1))), ids(chooseRemovals(items, 0.8, seededRandom(2))));
});
