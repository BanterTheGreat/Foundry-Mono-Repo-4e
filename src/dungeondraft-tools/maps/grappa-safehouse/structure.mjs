// The safehouse structure, interpreted ONCE from the encounter grid. Floors, walls, wall detail and shadows all read this one
// object, so they cannot disagree about what a wall square is.
//
// What the grid means here (rule 5): the encounter counts a whole square as wall, but a real wall is only a line on ONE edge of
// that square; the rest of the square is wall mass (masonry underfoot, dressed with props).
//  - The outer ring puts its line on the outside edge of the ring squares (the edge facing the street or corridor).
//  - Interior partitions have no "outside", so each puts its line on the edge facing the room that is NOT the squares' own side:
//    the horizontal partition on its south edge (facing the common room) and the vertical one on its east edge (facing the
//    storeroom). The mass squares therefore belong to the north-west rooms and carry the shelves.
//  - The corridor's far (south) wall and its west end are the walls of neighbouring buildings; they sit on the map edge.
// Every wall polyline is ordered so the half shadow, which fades to the LEFT of the direction of travel on screen, falls on the
// open side: clockwise for the outer ring (outside), west for the horizontal partition (south), south for the vertical partition
// (east), south then east for the corridor wall (into the corridor).
import { BASE_COLS, BASE_ROWS, COLS, ROWS, S } from './grid.mjs';

/** One square in each room, used to name the flood-filled rooms. */
export const ROOM_ANCHORS = { records: [3, 3], store: [13, 5], common: [8, 12] };

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Split a wall polyline into the stretches that actually stand: every opening removes a one-square gap centred on it.
 * Shadows are laid per stretch so they stop at doorways instead of running across them.
 *
 * @param {{points: number[][], loop: boolean, openings: number[][]}} wall
 * @returns {number[][][]} stretches as [[x0, y0], [x1, y1]] pairs, in travel order
 */
export function wallStretches(wall) {
  const { points, loop, openings } = wall;
  const count = loop ? points.length : points.length - 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const gaps = [];
    for (const [ox, oy] of openings) {
      const t = (ox - a[0]) * d[0] + (oy - a[1]) * d[1];
      const off = Math.abs(-(ox - a[0]) * d[1] + (oy - a[1]) * d[0]);
      if (off < 0.5 && t > -S / 2 && t < len + S / 2) { gaps.push([t - S / 2, t + S / 2]); }
    }
    gaps.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const g of gaps) {
      if (merged.length && g[0] <= merged[merged.length - 1][1] + 0.5) { merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], g[1]); }
      else { merged.push([...g]); }
    }
    let cur = 0;
    const pieces = [];
    for (const [g0, g1] of merged) {
      if (g0 > cur + 0.5) { pieces.push([cur, Math.min(g0, len)]); }
      cur = Math.max(cur, g1);
    }
    if (cur < len - 0.5) { pieces.push([cur, len]); }
    for (const [t0, t1] of pieces) {
      out.push([[a[0] + d[0] * t0, a[1] + d[1] * t0], [a[0] + d[0] * t1, a[1] + d[1] * t1]]);
    }
  }
  return out;
}

/**
 * @param {{at: Function, of: Function, cells: Map}} grid the parsed, extended encounter grid
 * @returns the structure: squares ("c,r" keys), rooms, walls with openings, the wall-mass band and the outdoor zones
 */
export function deriveStructure(grid) {
  const key = (c, r) => `${c},${r}`;
  const ring = { c1: 1, c2: BASE_COLS, r1: 1, r2: BASE_ROWS };
  const isRing = (c, r) => c === ring.c1 || c === ring.c2 || r === ring.r1 || r === ring.r2;
  const solid = (c, r) => ['wall', 'door'].includes(grid.at(c, r)?.kind);

  const doorCells = grid.of('door').map(({ c, r }) => [c, r]);
  const doorKeys = new Set(doorCells.map(([c, r]) => key(c, r)));
  const wallSquares = new Set(grid.of('wall').map(({ c, r }) => key(c, r)));
  // masonry underfoot: every wall square except the doorways; plank floor in the doorway squares
  const massCells = new Set(wallSquares);

  // the ring must be solid all round
  for (let c = ring.c1; c <= ring.c2; c++) { for (const r of [ring.r1, ring.r2]) { if (!solid(c, r)) { throw new Error(`The outer ring has a gap at (${c},${r})`); } } }
  for (let r = ring.r1; r <= ring.r2; r++) { for (const c of [ring.c1, ring.c2]) { if (!solid(c, r)) { throw new Error(`The outer ring has a gap at (${c},${r})`); } } }

  // interior partitions: a horizontal one is a row of wall / door squares from the west ring to the east ring; a vertical one
  // is a column of them from the north ring down to a horizontal partition (or the south ring)
  const hRows = [];
  for (let r = ring.r1 + 1; r < ring.r2; r++) {
    let all = true;
    for (let c = ring.c1 + 1; c < ring.c2; c++) { all &&= solid(c, r); }
    if (all) { hRows.push(r); }
  }
  const vCols = [];
  for (let c = ring.c1 + 1; c < ring.c2; c++) {
    let r = ring.r1 + 1;
    while (r < ring.r2 && solid(c, r) && !hRows.includes(r)) { r++; }
    if (r > ring.r1 + 1) { vCols.push({ c, rEnd: r - 1, endsAt: hRows.includes(r) ? r : ring.r2 }); }
  }
  // every wall square must belong to the ring, a horizontal or a vertical partition: anything else is a layout this
  // interpretation cannot draw
  for (const cell of grid.of('wall', 'door')) {
    const { c, r } = cell;
    const inV = vCols.some((v) => v.c === c && r >= ring.r1 + 1 && r <= v.rEnd);
    if (!isRing(c, r) && !hRows.includes(r) && !inV) { throw new Error(`Wall square (${c},${r}) is not part of the ring or a straight partition`); }
  }

  // ---------- rooms: flood fill over the open squares inside the building, doorways excluded so they separate rooms ----------
  const open = (c, r) => c > ring.c1 && c < ring.c2 && r > ring.r1 && r < ring.r2 && !solid(c, r);
  const roomOf = new Map();
  const rooms = [];
  for (let r = ring.r1 + 1; r < ring.r2; r++) {
    for (let c = ring.c1 + 1; c < ring.c2; c++) {
      if (!open(c, r) || roomOf.has(key(c, r))) { continue; }
      const cells = new Set([key(c, r)]);
      const stack = [[c, r]];
      roomOf.set(key(c, r), rooms.length);
      while (stack.length) {
        const [cc, rr] = stack.pop();
        for (const [dc, dr] of NEIGHBOURS) {
          const k = key(cc + dc, rr + dr);
          if (open(cc + dc, rr + dr) && !roomOf.has(k)) { roomOf.set(k, rooms.length); cells.add(k); stack.push([cc + dc, rr + dr]); }
        }
      }
      rooms.push({ cells });
    }
  }
  for (const room of rooms) {
    const anchor = Object.entries(ROOM_ANCHORS).find(([, [ac, ar]]) => room.cells.has(key(ac, ar)));
    if (!anchor) { throw new Error('A room contains none of the named anchor squares'); }
    room.name = anchor[0];
  }
  if (rooms.length !== Object.keys(ROOM_ANCHORS).length) { throw new Error(`Expected ${Object.keys(ROOM_ANCHORS).length} rooms, found ${rooms.length}`); }
  const roomNamed = (name) => rooms.find((room) => room.name === name);

  // plank floor in the doorway squares; each room has its own floor
  const floorCells = new Set(doorKeys);
  for (const room of rooms) { for (const k of room.cells) { floorCells.add(k); } }

  // ---------- walls (rule 5): one thin line per wall, on the edge described at the top of this file ----------
  const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];
  const outerLine = [[0, 0], [BASE_COLS * S, 0], [BASE_COLS * S, BASE_ROWS * S], [0, BASE_ROWS * S]];
  const outerOpenings = doorCells.filter(([c, r]) => isRing(c, r)).map(([c, r]) => {
    const [cx, cy] = centre(c, r);
    if (c === ring.c1) { return [0, cy]; }
    if (c === ring.c2) { return [BASE_COLS * S, cy]; }
    if (r === ring.r1) { return [cx, 0]; }
    return [cx, BASE_ROWS * S];
  });
  const walls = [{ id: 'outer', loop: true, points: outerLine, openings: outerOpenings, out: null }];
  for (const r of hRows) {
    const openings = doorCells.filter(([, dr]) => dr === r).map(([c]) => [(c - 0.5) * S, r * S]);
    walls.push({ id: `partition-row-${r}`, loop: false, points: [[BASE_COLS * S, r * S], [0, r * S]], openings, out: [0, 1] });
  }
  for (const v of vCols) {
    const openings = doorCells.filter(([c, r]) => c === v.c && r <= v.rEnd).map(([, r]) => [v.c * S, (r - 0.5) * S]);
    walls.push({ id: `partition-col-${v.c}`, loop: false, points: [[v.c * S, 0], [v.c * S, v.endsAt * S]], openings, out: [1, 0] });
  }
  // the neighbouring buildings that close the corridor: its west end, then its south side
  walls.push({ id: 'corridor', loop: false, points: [[0, BASE_ROWS * S], [0, ROWS * S], [BASE_COLS * S, ROWS * S]], openings: [], out: null });

  // ---------- wall mass band: every wall square with the facts wall detail needs ----------
  // `out` points from the square towards the wall line it is backed by; `rot` turns props drawn mounting-edge up (rotation 0
  // faces a north wall) to face that line.
  const band = [];
  const nextToDoor = (c, r) => NEIGHBOURS.some(([dc, dr]) => doorKeys.has(key(c + dc, r + dr)));
  for (let r = 1; r <= BASE_ROWS; r++) {
    for (let c = 1; c <= BASE_COLS; c++) {
      if (!wallSquares.has(key(c, r))) { continue; }
      const inH = hRows.includes(r), inV = vCols.some((v) => v.c === c && r <= v.rEnd);
      const junction = inH && vCols.some((v) => v.c === c && v.endsAt === r); // where a vertical partition meets a horizontal one
      let side;
      let corner = false;
      if (isRing(c, r)) {
        if (r === ring.r1) { side = { out: [0, -1], rot: 0 }; }
        else if (r === ring.r2) { side = { out: [0, 1], rot: Math.PI }; }
        else if (c === ring.c1) { side = { out: [-1, 0], rot: -Math.PI / 2 }; }
        else { side = { out: [1, 0], rot: Math.PI / 2 }; }
        corner = (c === ring.c1 || c === ring.c2) && (r === ring.r1 || r === ring.r2);
      } else if (junction) {
        side = { out: [0, 1], rot: Math.PI }; // backed by both partitions
        corner = true;
      } else if (inH) {
        side = { out: [0, 1], rot: Math.PI };
      } else {
        side = { out: [1, 0], rot: Math.PI / 2 };
      }
      band.push({ c, r, ...side, corner, door: false, nextToDoor: nextToDoor(c, r), ring: isRing(c, r) });
    }
  }

  // ---------- the outdoors ----------
  const streetX = BASE_COLS * S; // the building's east wall line; the pavement starts here
  const zones = {
    pavement: { x0: streetX, y0: 0, x1: streetX + S, y1: ROWS * S },
    road: { x0: streetX + S, y0: 0, x1: COLS * S, y1: ROWS * S },
    corridor: { x0: 0, y0: BASE_ROWS * S, x1: BASE_COLS * S, y1: ROWS * S },
    building: { x0: 0, y0: 0, x1: BASE_COLS * S, y1: BASE_ROWS * S },
  };

  return { ring, doorCells, doorKeys, wallSquares, massCells, floorCells, rooms, roomOf, roomNamed, hRows, vCols, walls, band, zones, centre };
}
