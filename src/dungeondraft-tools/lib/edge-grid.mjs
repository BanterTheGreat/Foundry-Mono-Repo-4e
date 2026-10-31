// Reader for the encounter grids the dnd4e-battlemap skill now writes, where a wall is an edge and never fills a square.
// Each cell is an element titled `Column c, row r: <terrain>` that may carry `data-walls="N,E"` and `data-doors="W"` (compass
// letters for its walled and door/gap sides). A shared edge is written on both neighbouring cells; the boundary wall only on the
// edge cell. The older maps (dockyard, Cloudwood, the safehouse) use whole-square walls and are read by their own grid.mjs; they
// carry no such attributes, so hasEdgeData() tells the two formats apart.
//
// This turns the attributes into wall lines on grid coordinates, ready for a map's structure.mjs: it does not decide what a
// corner, a room or a doorway looks like, so corners stay where two runs meet.

const SIDES = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };
/** Cell tags, with the optional creature id some grids append to the terrain ("Open ground, A.1"). */
const CELL_TAG = /<[^<>]*\btitle="Column (\d+), row (\d+): ([^",]+)(?:, [A-Z]\.\d)?"[^<>]*>/g;

/**
 * Whether a grid page uses the edge-wall format.
 * @param {string} html The grid page.
 * @returns {boolean}
 */
export function hasEdgeData(html) {
  return /\bdata-(?:walls|doors)="/.test(html);
}

/** The compass letters in one attribute value, validated. */
function sidesOf(tag, attribute, where) {
  const m = tag.match(new RegExp(`\\b${attribute}="([^"]*)"`));
  const letters = m ? m[1].split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase()) : [];
  for (const s of letters) {
    if (!(s in SIDES)) { throw new Error(`${where}: "${s}" in ${attribute} is not a compass side (N, E, S, W)`); }
  }
  if (new Set(letters).size !== letters.length) { throw new Error(`${where}: ${attribute} lists a side twice`); }
  return new Set(letters);
}

/**
 * Parse an edge-wall grid.
 *
 * @param {string} html The grid page.
 * @param {{size?: number}} [options] Square size in px (256 matches the maps).
 * @returns {{
 *   cols: number, rows: number, size: number,
 *   cells: Map<string, {c: number, r: number, terrain: string, walls: Set<string>, doors: Set<string>}>,
 *   edges: {kind: 'wall'|'door', horizontal: boolean, x1: number, y1: number, x2: number, y2: number}[],
 *   lines: {horizontal: boolean, points: number[][], openings: {x: number, y: number}[]}[]
 * }} `edges` holds each distinct edge once, in px. `lines` merges collinear touching edges into straight runs; a door or gap edge
 *   stays inside its run as an `openings` entry (its midpoint) so the wall is continuous and the doorway is a portal on it.
 * @throws {Error} When cells are missing or duplicated, a side is not N/E/S/W, a side is both wall and door, or a shared edge is
 *   not written on both neighbours with the same kind.
 */
export function parseEdgeGrid(html, { size = 256 } = {}) {
  const cells = new Map();
  for (const m of html.matchAll(CELL_TAG)) {
    const c = Number(m[1]), r = Number(m[2]), where = `Column ${c}, row ${r}`;
    if (cells.has(`${c},${r}`)) { throw new Error(`${where} appears twice`); }
    const walls = sidesOf(m[0], 'data-walls', where), doors = sidesOf(m[0], 'data-doors', where);
    for (const s of walls) {
      if (doors.has(s)) { throw new Error(`${where}: side ${s} is both a wall and a door`); }
    }
    cells.set(`${c},${r}`, { c, r, terrain: m[3], walls, doors });
  }
  if (!cells.size) { throw new Error('No cells titled "Column c, row r: <terrain>" found'); }
  const cols = Math.max(...[...cells.values()].map((x) => x.c)), rows = Math.max(...[...cells.values()].map((x) => x.r));
  if (cells.size !== cols * rows) { throw new Error(`Expected ${cols * rows} cells for a ${cols} x ${rows} grid, found ${cells.size}`); }

  /** Which kind of edge a cell has on a side, or null. */
  const kindOn = (cell, side) => (cell.walls.has(side) ? 'wall' : cell.doors.has(side) ? 'door' : null);
  const edges = [];
  for (const cell of cells.values()) {
    for (const side of Object.keys(SIDES)) {
      const kind = kindOn(cell, side);
      if (!kind) { continue; }
      const [dc, dr] = SIDES[side];
      const neighbour = cells.get(`${cell.c + dc},${cell.r + dr}`);
      if (neighbour && kindOn(neighbour, OPPOSITE[side]) !== kind) {
        throw new Error(`Column ${cell.c}, row ${cell.r}: ${kind} on side ${side} is not written as a ${kind} on side ${OPPOSITE[side]} of column ${neighbour.c}, row ${neighbour.r}`);
      }
      // each shared edge once: the north and west cell owns it
      if (neighbour && (side === 'S' || side === 'E')) { continue; }
      const x0 = (cell.c - 1) * size, y0 = (cell.r - 1) * size;
      const horizontal = side === 'N' || side === 'S';
      const x1 = side === 'E' ? x0 + size : x0, y1 = side === 'S' ? y0 + size : y0;
      edges.push({ kind, horizontal, x1, y1, x2: horizontal ? x1 + size : x1, y2: horizontal ? y1 : y1 + size });
    }
  }
  return { cols, rows, size, cells, edges, lines: mergeLines(edges) };
}

/** Merge touching collinear edges into runs, in reading order (horizontal lines top to bottom, then vertical left to right). */
function mergeLines(edges) {
  const groups = new Map();
  for (const e of edges) {
    const key = `${e.horizontal ? 'h' : 'v'}:${e.horizontal ? e.y1 : e.x1}`;
    if (!groups.has(key)) { groups.set(key, []); }
    groups.get(key).push(e);
  }
  const lines = [];
  const keys = [...groups.keys()].sort((a, b) => (a[0] === b[0] ? Number(a.slice(2)) - Number(b.slice(2)) : a[0] < b[0] ? -1 : 1));
  for (const key of keys) {
    const horizontal = key[0] === 'h';
    const along = (e, end) => (horizontal ? (end ? e.x2 : e.x1) : (end ? e.y2 : e.y1));
    const fixed = Number(key.slice(2));
    let run = null;
    for (const e of groups.get(key).sort((a, b) => along(a, false) - along(b, false))) {
      if (!run || along(e, false) !== run.to) {
        if (run) { lines.push(finish(run)); }
        run = { horizontal, fixed, from: along(e, false), to: along(e, true), openings: [] };
      } else {
        run.to = along(e, true);
      }
      if (e.kind === 'door') { run.openings.push(horizontal ? { x: (e.x1 + e.x2) / 2, y: fixed } : { x: fixed, y: (e.y1 + e.y2) / 2 }); }
    }
    if (run) { lines.push(finish(run)); }
  }
  return lines;
}

function finish(run) {
  const points = run.horizontal ? [[run.from, run.fixed], [run.to, run.fixed]] : [[run.fixed, run.from], [run.fixed, run.to]];
  return { horizontal: run.horizontal, points, openings: run.openings };
}
