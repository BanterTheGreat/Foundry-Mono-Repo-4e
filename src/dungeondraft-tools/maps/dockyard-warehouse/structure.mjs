// The warehouse structure, interpreted ONCE from the encounter grid. Floors, walls and wall detail all read from this one
// object, so they cannot disagree about what a wall square is. (Before this, each step re-derived the ring and the doorways.)
//
// What the grid means here (rule 5): the encounter counts a whole square as wall, but the real wall is only a line on the
// OUTER edge of the wall squares. The rest of each wall square is wall mass: masonry underfoot, dressed with props. The inner
// edge of the band is not a wall; it only exists here as a reference line for debris.
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
  // masonry underfoot: every wall square except the doorways
  const massCells = new Set([...wallSquares].filter((k) => !doorKeys.has(k)));
  // plank floor: every square inside the ring, plus the doorway squares through it
  const floorCells = new Set(doorKeys);
  for (let c = ring.c1 + 1; c < ring.c2; c++) { for (let r = ring.r1 + 1; r < ring.r2; r++) { floorCells.add(key(c, r)); } }

  const room = { x0: ring.c1 * S, y0: ring.r1 * S, x1: (ring.c2 - 1) * S, y1: (ring.r2 - 1) * S };
  const outerRect = { x0: (ring.c1 - 1) * S, y0: (ring.r1 - 1) * S, x1: ring.c2 * S, y1: ring.r2 * S };

  // the one real wall: a closed loop on the outer edge of the wall squares, clockwise on screen
  const wallLine = [[outerRect.x0, outerRect.y0], [outerRect.x1, outerRect.y0], [outerRect.x1, outerRect.y1], [outerRect.x0, outerRect.y1]];
  // the band's inside edge, clockwise: a reference line for debris, never a wall
  const roomEdge = [[room.x0, room.y0], [room.x1, room.y0], [room.x1, room.y1], [room.x0, room.y1]];

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
  const add = (c, r) => band.push({ c, r, ...sideOf(c, r), door: doorKeys.has(key(c, r)), corner: isCorner(c, r), nextToDoor: nextToDoor(c, r) });
  for (let c = ring.c1; c <= ring.c2; c++) { add(c, ring.r1); add(c, ring.r2); }
  for (let r = ring.r1 + 1; r < ring.r2; r++) { add(ring.c1, r); add(ring.c2, r); }

  return { ring, doorCells, doorKeys, wallSquares, massCells, floorCells, room, outerRect, wallLine, roomEdge, openings, band };
}
