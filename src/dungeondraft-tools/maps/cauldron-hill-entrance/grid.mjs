// The Cauldron Hill entrance encounter grid (an edge-wall grid, see lib/edge-grid.mjs) as data: 40 columns x 28 rows of 5 ft squares,
// north up. Besides the terrain label and the wall / door edges every cell carries `data-height` (0, +5 for the worn ascents, +10 for
// the ledges), which the edge-grid reader does not parse, so it is read again here. Terrain labels are free text per encounter, so
// they are named once below.
import { parseEdgeGrid } from '../../lib/edge-grid.mjs';

export const S = 256; // px per 5 ft square
export const COLS = 40;
export const ROWS = 28;

/** Terrain kinds, keyed by the encounter's own label. */
export const LABEL = {
  open: 'Open ground',
  diff: 'Scrub and scree (difficult)',
  tree: 'Dead tree (blocking)',
  boulder: 'Boulder (blocking)',
  machine: 'Hydraulic mechanism (blocking)',
  rock: 'Solid rock (off-map)',
  ward: 'Ward post (cover)',
  slag: 'Slag heap (cover)',
  cart: 'Rail cart (cover)',
  furn: 'Guard-room furnishings (cover)',
  debris: 'Shack debris (cover)',
  pyre: 'Unlit pyre (cover)',
  ramp: 'Worn ascent (ramp)',
  start: 'Party start',
  lever: 'Door lever',
  gate: 'Rusted ring gate',
};
const KIND_OF = Object.fromEntries(Object.entries(LABEL).map(([kind, label]) => [label, kind]));

/**
 * Parse the encounter grid.
 * @param {string} html The grid page.
 * @returns {{
 *   cols: number, rows: number, size: number,
 *   cells: Map<string, {c: number, r: number, terrain: string, kind: string, h: number, walls: Set<string>, doors: Set<string>}>,
 *   edges: object[], at: (c: number, r: number) => object | undefined, of: (...kinds: string[]) => object[]
 * }} `edges` holds each wall and door edge once, in px.
 * @throws {Error} When the page is not the 40 x 28 grid, a terrain label is unknown or a cell has no height.
 */
export function parseGrid(html) {
  const base = parseEdgeGrid(html, { size: S });
  if (base.cols !== COLS || base.rows !== ROWS) { throw new Error(`Expected the ${COLS} x ${ROWS} encounter grid, parsed ${base.cols} x ${base.rows}`); }
  const heights = new Map();
  for (const m of html.matchAll(/<[^<>]*\btitle="Column (\d+), row (\d+):[^"]*"[^<>]*\bdata-height="(-?\d+)"[^<>]*>/g)) { heights.set(`${m[1]},${m[2]}`, Number(m[3])); }
  const cells = new Map();
  for (const cell of base.cells.values()) {
    const kind = KIND_OF[cell.terrain];
    if (!kind) { throw new Error(`Unknown terrain label "${cell.terrain}" at column ${cell.c}, row ${cell.r}`); }
    const h = heights.get(`${cell.c},${cell.r}`);
    if (h === undefined) { throw new Error(`Column ${cell.c}, row ${cell.r} has no data-height`); }
    cells.set(`${cell.c},${cell.r}`, { ...cell, kind, h });
  }
  const at = (c, r) => cells.get(`${c},${r}`);
  const of = (...kinds) => [...cells.values()].filter((cell) => kinds.includes(cell.kind));
  return { cols: COLS, rows: ROWS, size: S, cells, edges: base.edges, at, of };
}
