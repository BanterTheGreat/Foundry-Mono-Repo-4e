// The Cauldron Hill entrance, interpreted ONCE from the encounter grid. Floors, walls, cliffs, ramps, shadows and dressing all read this
// one object, so they cannot disagree about where a room, a wall or a ledge is.
//
// What the grid means here: it is an edge-wall grid, so a wall is already a line on a grid line and a square is already walkable.
// Every wall edge becomes one of three things, chosen by what lies on either side of it:
//   steel   - touches a foyer room (the facade, the guard room, the mechanism room, the lobby and the tunnel)
//   timber  - touches a shack
//   stone   - touches solid rock or the ring-gate trench (the trench cut and the rock core inside its loop)
//   cliff   - separates squares of different height outside any building (the ledge faces and the sides of the worn ascents). A cliff
//             is drawn as a continuous cliff strip, never as a wall (mapping rule 7).
// A worn ascent has no wall on its climbing edges, so the height change there is a slope, not a cliff.
import { decompose } from '../../lib/geometry.mjs';
import { mergeLines } from '../../lib/edge-grid.mjs';
import { COLS, ROWS, S } from './grid.mjs';

/** Rooms, each named by a square it contains (the foyer's three rooms and the three shacks). */
const ROOMS = [
  { name: 'lobby', has: [20, 5], kind: 'foyer' },
  { name: 'mech', has: [17, 4], kind: 'foyer' },
  { name: 'guard', has: [24, 5], kind: 'foyer' },
  { name: 'shackA', has: [7, 13], kind: 'shack' },
  { name: 'shackB', has: [11, 18], kind: 'shack' },
  { name: 'shackE', has: [34, 17], kind: 'shack' },
];
/** The ring-gate trench: the U-shaped cut, as a bounding box of squares (its rock core inside is solid rock). */
const TRENCH = { c1: 26, r1: 8, c2: 33, r2: 12 };

const SIDES = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/**
 * @param {ReturnType<import('./grid.mjs').parseGrid>} grid The parsed grid.
 * @returns the structure: `classOf(c, r)`, floor rectangles, wall `lines` per material with `stretches`, chained `walls`, `cliffs`,
 *   `ramps`, and `centre`.
 */
export function deriveStructure(grid) {
  // ---------- barrier lookup: every wall and door edge, so rooms are found by flood fill ----------
  const blocked = (cell, side) => cell.walls.has(side) || cell.doors.has(side);

  // ---------- rooms: flood fill from each named square, stopping at walls and doors ----------
  const roomOf = new Map(); // "c,r" -> room name
  for (const room of ROOMS) {
    const start = grid.at(...room.has);
    if (!start || roomOf.has(`${start.c},${start.r}`)) { throw new Error(`Room ${room.name} has no usable start square ${room.has}`); }
    const queue = [start];
    roomOf.set(`${start.c},${start.r}`, room.name);
    while (queue.length) {
      const cell = queue.pop();
      for (const [side, [dc, dr]] of Object.entries(SIDES)) {
        const next = grid.at(cell.c + dc, cell.r + dr);
        if (!next || blocked(cell, side) || roomOf.has(`${next.c},${next.r}`)) { continue; }
        roomOf.set(`${next.c},${next.r}`, room.name);
        queue.push(next);
      }
    }
  }
  const roomKind = Object.fromEntries(ROOMS.map((r) => [r.name, r.kind]));
  const inTrench = (c, r) => c >= TRENCH.c1 && c <= TRENCH.c2 && r >= TRENCH.r1 && r <= TRENCH.r2;
  /** What a square is: a room name, 'rock', 'trench', 'ramp', 'ledge' or 'ground' (null off the map). */
  const classOf = (c, r) => {
    const cell = grid.at(c, r);
    if (!cell) { return null; }
    const room = roomOf.get(`${c},${r}`);
    if (room) { return room; }
    if (cell.kind === 'rock') { return 'rock'; }
    if (inTrench(c, r)) { return 'trench'; }
    if (cell.kind === 'ramp') { return 'ramp'; }
    return cell.h >= 10 ? 'ledge' : 'ground';
  };
  const isRoom = (cls) => cls in roomKind;

  // ---------- floors ----------
  const cellsWhere = (test) => [...grid.cells.values()].filter((cell) => test(classOf(cell.c, cell.r))).map((cell) => `${cell.c},${cell.r}`);
  const floors = {
    steel: decompose(cellsWhere((cls) => cls === 'lobby' || cls === 'mech'), COLS, ROWS),
    guard: decompose(cellsWhere((cls) => cls === 'guard'), COLS, ROWS),
    shack: decompose(cellsWhere((cls) => roomKind[cls] === 'shack'), COLS, ROWS),
    rock: decompose(cellsWhere((cls) => cls === 'rock'), COLS, ROWS),
  };

  // ---------- edges: classify each into a wall material or a cliff ----------
  const sidesOfEdge = (e) => {
    // the two squares an edge separates (the second is null on the map boundary)
    if (e.horizontal) {
      const c = e.x1 / S + 1, r = e.y1 / S;
      return [grid.at(c, r), grid.at(c, r + 1)];
    }
    const c = e.x1 / S, r = e.y1 / S + 1;
    return [grid.at(c, r), grid.at(c + 1, r)];
  };
  const byMaterial = { steel: [], timber: [], stone: [] };
  const cliffEdges = [];
  for (const e of grid.edges) {
    const [a, b] = sidesOfEdge(e);
    const ca = a ? classOf(a.c, a.r) : null, cb = b ? classOf(b.c, b.r) : null;
    const classes = [ca, cb].filter(Boolean);
    let material;
    if (classes.some((cls) => roomKind[cls] === 'foyer')) { material = 'steel'; }
    else if (classes.some((cls) => roomKind[cls] === 'shack')) { material = 'timber'; }
    else if (classes.some((cls) => cls === 'rock' || cls === 'trench')) { material = 'stone'; }
    if (material) { byMaterial[material].push(e); continue; }
    if (e.kind === 'door') { throw new Error(`A door edge at (${e.x1}, ${e.y1}) is outside every building`); }
    if (!a || !b || a.h === b.h) { throw new Error(`A wall edge at (${e.x1}, ${e.y1}) separates ${ca} from ${cb} at the same height and is not a cliff`); }
    const aHigh = a.h > b.h;
    cliffEdges.push(e.horizontal
      ? { vertical: false, line: e.y1, from: e.x1, to: e.x2, n: [0, aHigh ? -1 : 1], drop: Math.abs(a.h - b.h) }
      : { vertical: true, line: e.x1, from: e.y1, to: e.y2, n: [aHigh ? -1 : 1, 0], drop: Math.abs(a.h - b.h) });
  }

  // every height change outside the buildings needs a cliff unless a worn ascent climbs it (mapping rule 7)
  const hasWall = (cell, side) => cell.walls.has(side);
  for (const cell of grid.cells.values()) {
    for (const [side, [dc, dr]] of [['E', [1, 0]], ['S', [0, 1]]]) {
      const next = grid.at(cell.c + dc, cell.r + dr);
      if (!next || cell.h === next.h) { continue; }
      const ca = classOf(cell.c, cell.r), cb = classOf(next.c, next.r);
      if (isRoom(ca) || isRoom(cb) || ca === 'rock' || cb === 'rock' || ca === 'trench' || cb === 'trench') { continue; }
      if (hasWall(cell, side)) { continue; } // a cliff edge already
      if (cell.kind === 'ramp' || next.kind === 'ramp') { continue; } // the ascent itself
      throw new Error(`Height changes between (${cell.c},${cell.r}) +${cell.h} and (${next.c},${next.r}) +${next.h} with no wall or ascent: it would be a gap in the cliff`);
    }
  }

  // ---------- cliffs: collinear edges with the same high side, merged into continuous runs ----------
  const cliffs = [];
  const groups = new Map();
  for (const e of cliffEdges) {
    const key = `${e.vertical}|${e.line}|${e.n}`;
    if (!groups.has(key)) { groups.set(key, []); }
    groups.get(key).push(e);
  }
  for (const list of groups.values()) {
    list.sort((x, y) => x.from - y.from);
    let cur = null;
    for (const e of list) {
      if (cur && Math.abs(cur.to - e.from) < 0.5) { cur.to = e.to; cur.drop = Math.max(cur.drop, e.drop); } else { cur = { ...e }; cliffs.push(cur); }
    }
  }
  for (const run of cliffs) {
    run.a = run.vertical ? [run.line, run.from] : [run.from, run.line];
    run.b = run.vertical ? [run.line, run.to] : [run.to, run.line];
  }
  cliffs.sort((x, y) => Number(x.vertical) - Number(y.vertical) || x.line - y.line || x.from - y.from);

  // ---------- ramps: the walkable ascents; they climb north, onto the ledge ----------
  const rampCells = grid.of('ramp');
  const ramps = [];
  for (const cell of rampCells.sort((x, y) => x.c - y.c)) {
    const last = ramps[ramps.length - 1];
    if (last && last.r === cell.r && last.c2 === cell.c - 1) { last.c2 = cell.c; } else { ramps.push({ c1: cell.c, c2: cell.c, r: cell.r }); }
  }
  for (const ramp of ramps) {
    ramp.x0 = (ramp.c1 - 1) * S;
    ramp.x1 = ramp.c2 * S;
    ramp.y0 = (ramp.r - 1) * S;
    ramp.y1 = ramp.r * S;
  }

  // ---------- walls: straight runs per material, standing stretches between doorways, and what lies on each side ----------
  const lines = [];
  for (const [material, edges] of Object.entries(byMaterial)) {
    for (const line of mergeLines(edges)) {
      const { horizontal } = line;
      const [[x1, y1], [x2, y2]] = line.points;
      const fixed = horizontal ? y1 : x1;
      const from = horizontal ? x1 : y1, to = horizontal ? x2 : y2;
      const gaps = line.openings.map((o) => { const m = horizontal ? o.x : o.y; return [m - S / 2, m + S / 2]; }).sort((a, b) => a[0] - b[0]);
      const spans = [];
      let at = from;
      for (const [g0, g1] of gaps) {
        if (g0 > at + 0.5) { spans.push([at, g0]); }
        at = Math.max(at, g1);
      }
      if (to > at + 0.5) { spans.push([at, to]); }
      if (!spans.length) { continue; } // a run that is all doorway (the open north end of the tunnel) draws no wall
      const point = (t) => (horizontal ? [t, fixed] : [fixed, t]);
      const normals = horizontal ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      /** The class of the square on each side of the wall at the middle of the square starting `t` px along the line. */
      const sidesAt = (t) => normals.map((n) => {
        const px = horizontal ? t + S / 2 : fixed + n[0] * S / 2, py = horizontal ? fixed + n[1] * S / 2 : t + S / 2;
        return { n, cls: classOf(Math.floor(px / S) + 1, Math.floor(py / S) + 1) };
      });
      const stretches = [];
      for (const [a, b] of spans) {
        let start = a;
        for (let t = a; t < b - 0.5; t += S) {
          const next = t + S;
          const here = sidesAt(t).map((s) => s.cls).join('|');
          const after = next < b - 0.5 ? sidesAt(next).map((s) => s.cls).join('|') : null;
          if (after !== here) {
            stretches.push({ horizontal, fixed, a: point(start), b: point(next), from: start, to: next, sides: sidesAt(t) });
            start = next;
          }
        }
      }
      const partition = material === 'steel' && sidesAt(from).every((s) => isRoom(s.cls));
      lines.push({ material, horizontal, fixed, points: line.points, openings: line.openings.map((o) => [o.x, o.y]), stretches, partition });
    }
  }

  // ---------- wall records: each material's runs chained end to end where exactly two meet, so corners join ----------
  const walls = chainRuns(lines.map((l) => ({ material: l.material, partition: l.partition, points: l.points.map((p) => [...p]), openings: l.openings })));

  return { cols: COLS, rows: ROWS, classOf, roomOf, floors, lines, walls, cliffs, ramps, centre: (c, r) => [(c - 0.5) * S, (r - 0.5) * S] };
}

/**
 * Join wall runs of one material end to end into polylines. A point where exactly two runs of that material meet is a corner (the
 * wall carries on round it); where three or more meet (a partition joining a shell) every run stops, so each keeps its own end.
 * A run that closes on itself comes back as one polyline that starts and ends at the same point.
 * @param {{material: string, partition: boolean, points: number[][], openings: number[][]}[]} runs Two-point runs.
 * @returns {{material: string, partition: boolean, points: number[][], openings: number[][]}[]}
 */
export function chainRuns(runs) {
  const key = (p) => p.join(',');
  const touching = new Map(); // "material|x,y" -> run indices ending there
  runs.forEach((run, i) => run.points.forEach((p) => { const k = `${run.material}|${key(p)}`; touching.set(k, [...(touching.get(k) ?? []), i]); }));
  const degree = (run, p) => touching.get(`${run.material}|${key(p)}`).length;
  const used = new Set();
  const chains = [];
  const walk = (first, startPoint) => {
    const run = runs[first];
    let points = key(run.points[0]) === key(startPoint) ? [...run.points] : [...run.points].reverse();
    const openings = [...run.openings];
    used.add(first);
    for (;;) {
      const tail = points[points.length - 1];
      if (degree(run, tail) !== 2) { break; }
      const next = touching.get(`${run.material}|${key(tail)}`).find((i) => !used.has(i));
      if (next === undefined) { break; }
      used.add(next);
      const nextRun = runs[next];
      const oriented = key(nextRun.points[0]) === key(tail) ? nextRun.points : [...nextRun.points].reverse();
      points = [...points, oriented[1]];
      openings.push(...nextRun.openings);
    }
    chains.push({ material: run.material, partition: run.partition, points: points.map((p) => [...p]), openings });
  };
  // chains that begin at an end (a dead end or a junction) first, then whatever is left is a closed loop
  runs.forEach((run, i) => {
    if (used.has(i)) { return; }
    const start = run.points.find((p) => degree(run, p) !== 2);
    if (start) { walk(i, start); }
  });
  runs.forEach((run, i) => { if (!used.has(i)) { walk(i, run.points[0]); } });
  return chains;
}
