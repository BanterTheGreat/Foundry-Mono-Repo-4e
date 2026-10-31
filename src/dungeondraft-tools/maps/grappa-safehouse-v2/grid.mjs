// The Mindmaker's Last Delivery v2 encounter grid (an edge-wall grid, see lib/edge-grid.mjs) as data, plus the two additions the
// user asked for around it: a two-row corridor south of the building (the front doors open into it; it is part of the safehouse,
// and runs on off the west edge of the map) and a four-column street east of it (where the rear doors let out).
// The encounter's own numbering stays: column 1, row 1 is still the north-west corner, so the map is 20 columns by 16 rows
// and Foundry scene coordinates for the encounter squares do not move.
import { mergeLines, parseEdgeGrid } from '../../lib/edge-grid.mjs';

export const S = 256; // px per 5 ft square
export const BASE_COLS = 16;
export const BASE_ROWS = 14;
export const CORRIDOR_ROWS = 2;
export const STREET_COLS = 4;
export const COLS = BASE_COLS + STREET_COLS;
export const ROWS = BASE_ROWS + CORRIDOR_ROWS;

/** Terrain labels the encounter grid uses (the two added areas get their own). */
export const LABEL = {
  FLOOR: 'floor',
  LOW: 'low furniture or crates (cover, difficult)',
  PAPERS: 'scattered papers (difficult)',
  TALL: 'tall cases or crate stack (blocking)',
  CORRIDOR: 'corridor',
  STREET: 'street',
};

/**
 * Parse the grid and add the corridor and street.
 *
 * @param {string} html The encounter's grid page.
 * @param {{id: string, x: number, y: number, side: string}[]} [deployment] The encounter's deployment list (for Grappa's trolley).
 * @returns {{
 *   cols: number, rows: number, size: number, type: Record<string, string>, cells: (label: string) => number[][],
 *   edges: object[], lines: object[], ally: {x: number, y: number}, deployment: object[]
 * }} `type["c,r"]` is the terrain label of every square (original squares as the encounter wrote them); `edges` are every wall and
 *   door edge in px including the corridor's, and `lines` those edges merged into straight runs (doors stay as openings on a run).
 * @throws {Error} When the page is not the 16 x 14 encounter grid.
 */
export function parseGrid(html, deployment = []) {
  const base = parseEdgeGrid(html, { size: S });
  if (base.cols !== BASE_COLS || base.rows !== BASE_ROWS) { throw new Error(`Expected the ${BASE_COLS} x ${BASE_ROWS} encounter grid, parsed ${base.cols} x ${base.rows}`); }
  const type = {};
  for (const cell of base.cells.values()) { type[`${cell.c},${cell.r}`] = cell.terrain; }
  for (let r = BASE_ROWS + 1; r <= ROWS; r++) { for (let c = 1; c <= BASE_COLS; c++) { type[`${c},${r}`] = LABEL.CORRIDOR; } }
  for (let r = 1; r <= ROWS; r++) { for (let c = BASE_COLS + 1; c <= COLS; c++) { type[`${c},${r}`] = LABEL.STREET; } }

  // The corridor's closed sides. Its north side is the encounter's south wall (the front doors are the gap in it), the west end
  // is left open (the house goes on beyond the map), and the street side is the building's east wall carried down.
  const added = [];
  for (let c = 1; c <= BASE_COLS; c++) {
    added.push({ kind: 'wall', horizontal: true, x1: (c - 1) * S, y1: ROWS * S, x2: c * S, y2: ROWS * S });
  }
  for (let r = BASE_ROWS + 1; r <= ROWS; r++) {
    added.push({ kind: 'wall', horizontal: false, x1: BASE_COLS * S, y1: (r - 1) * S, x2: BASE_COLS * S, y2: r * S });
  }
  const edges = [...base.edges, ...added];

  const ally = deployment.find((d) => d.side === 'ally') ?? { x: 7, y: 5 };
  const cells = (label) => Object.entries(type).filter(([, t]) => t === label).map(([k]) => k.split(',').map(Number));
  return { cols: COLS, rows: ROWS, size: S, type, cells, edges, lines: mergeLines(edges), ally: { x: ally.x, y: ally.y }, deployment };
}

/** Connected rectangular blocks of one terrain label (every furniture block in this encounter is a rectangle). */
export function blocksOf(grid, label) {
  const mine = new Set(grid.cells(label).map(([c, r]) => `${c},${r}`));
  const seen = new Set();
  const out = [];
  const keys = [...mine].sort((a, b) => Number(a.split(',')[1]) - Number(b.split(',')[1]) || Number(a.split(',')[0]) - Number(b.split(',')[0]));
  for (const key of keys) {
    if (seen.has(key)) { continue; }
    const [c, r] = key.split(',').map(Number);
    let c2 = c;
    while (mine.has(`${c2 + 1},${r}`)) { c2++; }
    let r2 = r;
    while (Array.from({ length: c2 - c + 1 }, (_, i) => mine.has(`${c + i},${r2 + 1}`)).every(Boolean)) { r2++; }
    for (let a = c; a <= c2; a++) { for (let b = r; b <= r2; b++) { seen.add(`${a},${b}`); } }
    out.push({ c1: c, c2, r1: r, r2 });
  }
  return out;
}
