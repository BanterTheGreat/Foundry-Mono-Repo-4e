// The warehouse structure, interpreted ONCE from the encounter grid. Floors, walls and wall detail all read from this one
// object, so they cannot disagree about what a wall square is. (Before this, each step re-derived the ring and the doorways.)
//
// What the grid means here (rule 5): the encounter counts a whole square as wall, but the real wall is only a line on the
// OUTER edge of the wall squares. The square itself is ordinary walkable floor: the room's planks run right out to that line,
// and the wall squares are only dressed lightly (see the band) so they read as walkable.
import { S } from './grid.mjs';

/**
 * @param {{ring: {c1: number, c2: number, r1: number, r2: number}, doorCells: number[][]}} grid parsed encounter grid
 * @returns the structure: squares (as "col,row" keys), pixel rectangles and lines, doorway openings, and the wall-mass band
 */
export function deriveStructure(grid) {
  const { ring, doorCells } = grid;
  const key = (c, r) => `${c},${r}`;
  const doorKeys = new Set(doorCells.map(([c, r]) => key(c, r)));

  // wall squares: the rectangular ring (grid.mjs guarantees the grid forms one)
  const wallSquares = new Set();
  for (let c = ring.c1; c <= ring.c2; c++) { wallSquares.add(key(c, ring.r1)); wallSquares.add(key(c, ring.r2)); }
  for (let r = ring.r1; r <= ring.r2; r++) { wallSquares.add(key(ring.c1, r)); wallSquares.add(key(ring.c2, r)); }
  // plank floor: every square inside the outer wall line, wall squares and doorways included
  const floorCells = new Set();
  for (let c = ring.c1; c <= ring.c2; c++) { for (let r = ring.r1; r <= ring.r2; r++) { floorCells.add(key(c, r)); } }

  const outerRect = { x0: (ring.c1 - 1) * S, y0: (ring.r1 - 1) * S, x1: ring.c2 * S, y1: ring.r2 * S };

  // the one real wall: a closed loop on the outer edge of the wall squares, clockwise on screen
  const wallLine = [[outerRect.x0, outerRect.y0], [outerRect.x1, outerRect.y0], [outerRect.x1, outerRect.y1], [outerRect.x0, outerRect.y1]];
  // the floor's extent: everything inside the wall line
  const room = outerRect;

  // doorways: a gap in the wall line, centred on each door square's outer edge
  const openings = doorCells.map(([c, r]) => {
    const cx = (c - 0.5) * S, cy = (r - 0.5) * S;
    if (c === ring.c1) { return [outerRect.x0, cy]; }
    if (c === ring.c2) { return [outerRect.x1, cy]; }
    if (r === ring.r1) { return [cx, outerRect.y0]; }
    return [cx, outerRect.y1];
  });

  // wall mass band: every wall square with the facts wall detail needs. `out` points away from the building and `rot` turns
  // props drawn mounting-edge up (rotation 0 faces a north wall) to face the wall they sit on.
  const sideOf = (c, r) => {
    if (r === ring.r1) { return { out: [0, -1], rot: 0 }; }
    if (r === ring.r2) { return { out: [0, 1], rot: Math.PI }; }
    if (c === ring.c1) { return { out: [-1, 0], rot: -Math.PI / 2 }; }
    return { out: [1, 0], rot: Math.PI / 2 };
  };
  const isCorner = (c, r) => (c === ring.c1 || c === ring.c2) && (r === ring.r1 || r === ring.r2);
  const nextToDoor = (c, r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => doorKeys.has(key(c + dc, r + dr)));
  const band = [];
  // `doorward` is +1 / -1 when the adjacent door lies along +/- the wall direction (-out.y, out.x), else 0: dressing sits at that gap edge
  const doorward = (c, r, out) => {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (doorKeys.has(key(c + dc, r + dr))) { return Math.sign(dc * -out[1] + dr * out[0]); }
    }
    return 0;
  };
  const add = (c, r) => { const side = sideOf(c, r); band.push({ c, r, ...side, door: doorKeys.has(key(c, r)), corner: isCorner(c, r), nextToDoor: nextToDoor(c, r), doorward: doorward(c, r, side.out) }); };
  for (let c = ring.c1; c <= ring.c2; c++) { add(c, ring.r1); add(c, ring.r2); }
  for (let r = ring.r1 + 1; r < ring.r2; r++) { add(ring.c1, r); add(ring.c2, r); }

  // shadow runs (BW half shadows fade to the LEFT of travel): the wall line is clockwise on screen, so its left is outdoors;
  // the same runs reversed fade onto the floor inside. Both stop at the doorways.
  const doorGaps = (side) => {
    const spans = doorCells
      .filter(([c, r]) => (side === 'top' && r === ring.r1) || (side === 'bottom' && r === ring.r2) || (side === 'left' && c === ring.c1) || (side === 'right' && c === ring.c2))
      .map(([c, r]) => (side === 'top' || side === 'bottom' ? [(c - 1) * S, c * S] : [(r - 1) * S, r * S]))
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const span of spans) {
      if (merged.length && span[0] <= merged[merged.length - 1][1] + 0.5) { merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], span[1]); } else { merged.push([...span]); }
    }
    return merged;
  };
  /** The four sides of `rect` clockwise as straight runs, each with its doorway gaps cut out; `overhang` lengthens a run that ends at a corner. */
  const sideRuns = (rect, overhang) => {
    const { x0, y0, x1, y1 } = rect;
    const sides = [
      { side: 'top', a: [x0, y0], u: [1, 0], len: x1 - x0, toT: (g) => [g[0] - x0, g[1] - x0] },
      { side: 'right', a: [x1, y0], u: [0, 1], len: y1 - y0, toT: (g) => [g[0] - y0, g[1] - y0] },
      { side: 'bottom', a: [x1, y1], u: [-1, 0], len: x1 - x0, toT: (g) => [x1 - g[1], x1 - g[0]] },
      { side: 'left', a: [x0, y1], u: [0, -1], len: y1 - y0, toT: (g) => [y1 - g[1], y1 - g[0]] },
    ];
    const runs = [];
    for (const { side, a, u, len, toT } of sides) {
      const gaps = doorGaps(side).map(toT).sort((p, q) => p[0] - q[0]);
      let from = 0;
      const spans = [];
      for (const [g0, g1] of gaps) {
        if (g0 > from + 0.5) { spans.push([from, g0]); }
        from = Math.max(from, g1);
      }
      if (len > from + 0.5) { spans.push([from, len]); }
      for (const [t0, t1] of spans) {
        const end = t1 >= len - 0.5 ? len + overhang : t1; // only the run that reaches the corner wraps round it
        runs.push([[a[0] + u[0] * t0, a[1] + u[1] * t0], [a[0] + u[0] * end, a[1] + u[1] * end]]);
      }
    }
    return runs;
  };
  // No overhang round the corners: a run that wraps past a corner leaves a hard-edged block in the corner square, so each
  // strip simply meets its neighbour at the building corner.
  const shadowRuns = {
    outer: sideRuns(outerRect, 0),
    inner: sideRuns(outerRect, 0).map((run) => [...run].reverse()),
  };

  return { ring, doorCells, doorKeys, wallSquares, floorCells, room, outerRect, wallLine, openings, band, shadowRuns };
}
