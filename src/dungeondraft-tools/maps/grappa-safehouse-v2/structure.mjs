// The safehouse structure, interpreted ONCE from the encounter grid and its additions. Floors, walls, shadows and wall dressing all
// read this one object, so they cannot disagree about where a room, a wall or a doorway is.
//
// What the grid means here: this is an edge-wall grid, so a wall is already a line on a grid line and a square is already
// walkable floor (mapping rule 5 needs no reinterpretation). The rooms are found by flood fill, with every wall and every door
// edge a barrier, so a doorway separates two rooms and the structure fails loudly (rather than drawing something odd) when the
// grid does not split into exactly the five areas the scene knows how to dress.
import { decompose } from '../../lib/geometry.mjs';
import { BASE_COLS, COLS, ROWS, S } from './grid.mjs';

/** The areas the scene dresses, each named by the square it must contain. */
const AREAS = [
  { name: 'records', has: [1, 1] },
  { name: 'store', has: [11, 1] },
  { name: 'common', has: [1, 9] },
  { name: 'corridor', has: [1, 15] },
  { name: 'street', has: [17, 1] },
];

/**
 * @param {ReturnType<import('./grid.mjs').parseGrid>} grid The parsed grid with the corridor and street.
 * @returns the structure: `areaOf(c, r)`, floor rectangles per area, wall `lines` with their standing `stretches` and
 *   `openings`, and `faceSpot` for placing wall dressing flush against a wall face.
 */
export function deriveStructure(grid) {
  // ---------- barrier lookup: every wall and door edge, keyed by the square side it sits on ----------
  const barrier = new Set();
  for (const e of grid.edges) {
    if (e.horizontal) {
      barrier.add(`h,${e.x1 / S + 1},${e.y1 / S}`); // south side of the square above the edge
    } else {
      barrier.add(`v,${e.x1 / S},${e.y1 / S + 1}`); // east side of the square left of the edge
    }
  }
  const blocked = (c, r, dc, dr) => {
    if (dc === 1) { return barrier.has(`v,${c},${r}`); }
    if (dc === -1) { return barrier.has(`v,${c - 1},${r}`); }
    if (dr === 1) { return barrier.has(`h,${c},${r}`); }
    return barrier.has(`h,${c},${r - 1}`);
  };

  // ---------- areas: flood fill from each square, stopping at walls and doors ----------
  const areaName = new Map(); // "c,r" -> area name
  const regions = [];
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      if (areaName.has(`${c},${r}`)) { continue; }
      const cells = new Set([`${c},${r}`]);
      const queue = [[c, r]];
      while (queue.length) {
        const [qc, qr] = queue.pop();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = qc + dc, nr = qr + dr;
          if (nc < 1 || nr < 1 || nc > COLS || nr > ROWS || cells.has(`${nc},${nr}`) || blocked(qc, qr, dc, dr)) { continue; }
          cells.add(`${nc},${nr}`);
          queue.push([nc, nr]);
        }
      }
      const area = AREAS.find((a) => cells.has(`${a.has[0]},${a.has[1]}`));
      if (!area) { throw new Error(`The grid has an area around column ${c}, row ${r} that the scene does not know how to dress`); }
      for (const key of cells) { areaName.set(key, area.name); }
      regions.push({ name: area.name, cells });
    }
  }
  if (regions.length !== AREAS.length || new Set(regions.map((x) => x.name)).size !== AREAS.length) {
    throw new Error(`Expected ${AREAS.length} areas (${AREAS.map((a) => a.name)}), found ${regions.map((x) => x.name)}`);
  }
  /** The area a square belongs to, or null off the map. */
  const areaOf = (c, r) => areaName.get(`${c},${r}`) ?? null;
  const floors = Object.fromEntries(regions.map(({ name, cells }) => [name, decompose(cells, COLS, ROWS)]));

  // ---------- walls: straight runs, standing stretches between the doorways, and what lies on each side ----------
  const lines = grid.lines.map((line, id) => {
    const { horizontal } = line;
    const [[x1, y1], [x2, y2]] = line.points;
    const fixed = horizontal ? y1 : x1;
    const from = horizontal ? x1 : y1, to = horizontal ? x2 : y2;
    // the building's outside: its north, south and west boundary and its east wall. Everything else divides two rooms.
    const outer = horizontal ? fixed === 0 || fixed === ROWS * S : fixed === 0 || fixed === BASE_COLS * S;
    const gaps = line.openings.map((o) => { const m = horizontal ? o.x : o.y; return [m - S / 2, m + S / 2]; }).sort((a, b) => a[0] - b[0]);
    const spans = [];
    let at = from;
    for (const [g0, g1] of gaps) {
      if (g0 > at + 0.5) { spans.push([at, g0]); }
      at = Math.max(at, g1);
    }
    if (to > at + 0.5) { spans.push([at, to]); }
    const point = (t) => (horizontal ? [t, fixed] : [fixed, t]);
    const normals = horizontal ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    /** The area on each side of the wall at the middle of the square starting `t` px along the line. */
    const sidesAt = (t) => normals.map((n) => {
      const px = horizontal ? t + S / 2 : fixed + n[0] * S / 2, py = horizontal ? fixed + n[1] * S / 2 : t + S / 2;
      const c = Math.floor(px / S) + 1, r = Math.floor(py / S) + 1;
      const inMap = c >= 1 && r >= 1 && c <= COLS && r <= ROWS;
      return { n, area: inMap ? areaOf(c, r) : null };
    });
    // a stretch is split wherever the rooms on either side change, so every stretch faces exactly one room (or the outside) per side
    const stretches = [];
    for (const [a, b] of spans) {
      let start = a;
      for (let t = a; t < b - 0.5; t += S) {
        const next = t + S;
        const here = sidesAt(t).map((s) => s.area).join('|');
        const after = next < b - 0.5 ? sidesAt(next).map((s) => s.area).join('|') : null;
        if (after !== here) {
          stretches.push({ lineId: id, horizontal, fixed, a: point(start), b: point(next), from: start, to: next, outer, sides: sidesAt(t) });
          start = next;
        }
      }
    }
    return { id, horizontal, fixed, outer, points: line.points, openings: line.openings.map((o) => [o.x, o.y]), stretches };
  });

  /**
   * A point on a stretch's wall face: `t` px along the stretch from its first end, `back` px out from the wall line toward side `n`.
   * Dressing placed this way sits flush against the wall rather than inside it.
   */
  const faceSpot = (stretch, n, t, back) => {
    const along = stretch.from + t;
    return stretch.horizontal ? [along, stretch.fixed + n[1] * back] : [stretch.fixed + n[0] * back, along];
  };
  /** Rotation for a prop drawn mounting-edge up (rotation 0 faces a north wall) so that it hangs on a wall whose room lies toward `n`. */
  const wallRotation = (n) => Math.atan2(-n[0], n[1]);

  // ---------- wall records: the building's outside as ONE polyline (so its corners join), every partition as its own run ----------
  const walls = [...chainOuter(lines.filter((l) => l.outer)), ...lines.filter((l) => !l.outer).map((l) => ({ outer: false, points: l.points.map((p) => [...p]), openings: l.openings }))];

  const openings = lines.flatMap((l) => l.openings.map(([x, y]) => ({ x, y, outer: l.outer, horizontal: l.horizontal })));

  // doorway runs: adjacent openings on one wall line merged, as the straight span of wall line they leave open. Wherever the floor
  // of one room meets the next across a doorway, the two patterns touch with nothing to hide the seam.
  const doorwayRuns = [];
  for (const line of lines) {
    const mids = line.openings.map(([x, y]) => (line.horizontal ? x : y)).sort((a, b) => a - b);
    let run = null;
    for (const m of mids) {
      if (run && Math.abs(m - run.to - S / 2) < 0.5) { run.to = m + S / 2; } else { run = { from: m - S / 2, to: m + S / 2 }; doorwayRuns.push({ line, run }); }
    }
  }
  const seams = doorwayRuns.map(({ line, run }) => (line.horizontal ? [[run.from, line.fixed], [run.to, line.fixed]] : [[line.fixed, run.from], [line.fixed, run.to]]));
  return { cols: COLS, rows: ROWS, areaOf, regions, floors, lines, walls, openings, seams, faceSpot, wallRotation };
}

/**
 * Join the outer wall runs end to end into polylines. A run that ends where another begins shares that corner, so the wall has no
 * notch there. Throws when three runs meet at one point, which no building outline does.
 * @param {{points: number[][], openings: number[][]}[]} runs Two-point runs.
 * @returns {{outer: true, points: number[][], openings: number[][]}[]} Open polylines (closed outlines are returned as one open polyline starting and ending at the same point).
 */
function chainOuter(runs) {
  const key = (p) => p.join(',');
  const touching = new Map();
  runs.forEach((run, i) => run.points.forEach((p) => { touching.set(key(p), [...(touching.get(key(p)) ?? []), i]); }));
  for (const [k, list] of touching) {
    if (list.length > 2) { throw new Error(`Three outer wall runs meet at ${k}`); }
  }
  const used = new Set();
  const chains = [];
  // open ends first, so a chain that does not close starts at one of its ends
  const starts = [...runs.keys()].sort((x, y) => Number(runs[y].points.some((p) => touching.get(key(p)).length === 1)) - Number(runs[x].points.some((p) => touching.get(key(p)).length === 1)));
  for (const first of starts) {
    if (used.has(first)) { continue; }
    const run = runs[first];
    const open = run.points.find((p) => touching.get(key(p)).length === 1);
    let points = open ? (key(run.points[0]) === key(open) ? run.points : [...run.points].reverse()) : run.points;
    const openings = [...run.openings];
    used.add(first);
    for (;;) {
      const tail = points[points.length - 1];
      const next = (touching.get(key(tail)) ?? []).find((i) => !used.has(i));
      if (next === undefined) { break; }
      used.add(next);
      const nextRun = runs[next];
      const oriented = key(nextRun.points[0]) === key(tail) ? nextRun.points : [...nextRun.points].reverse();
      points = [...points, oriented[1]];
      openings.push(...nextRun.openings);
    }
    chains.push({ outer: true, points: points.map((p) => [...p]), openings });
  }
  return chains;
}
