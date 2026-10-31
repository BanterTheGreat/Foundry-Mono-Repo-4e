// The Cloudwood mole encounter's read-only grid (output/encounters/cloudwood-mole.html) as data, extended by one square on
// every side at the user's request ("a bit more playing space"). Cells are titled
// "(c,r) <terrain>, elevation +N feet <ID>"; terrain labels are free text per encounter, so they are named once here.
export const S = 256; // px per 5 ft square
export const BASE_COLS = 18;
export const BASE_ROWS = 14;
export const PAD = 1; // squares added on each side
export const COLS = BASE_COLS + 2 * PAD;
export const ROWS = BASE_ROWS + 2 * PAD;

/** Terrain kinds, keyed by the encounter's own label. */
export const LABEL = {
  trail: 'Firm trail / clearing',
  stream: 'Stream / wet undergrowth',
  trunk: 'Massive tree trunk',
  stair: 'Root stair / worn ascent',
  log: 'Fallen log',
  plank: 'Plank crossing',
  thorn: 'Thorn hollow',
  exit: 'Forest exit',
  start: 'Constable approach',
  cache: "Guide's waypoint cache",
};
const KIND_OF = Object.fromEntries(Object.entries(LABEL).map(([kind, label]) => [label, kind]));

/**
 * Parse the encounter and return the grid extended by PAD squares on every side.
 * `cells` maps "c,r" (1-based, extended numbering) to { c, r, kind, elev, ext }. An added square copies the elevation of the
 * nearest original square, so every height line runs on to the new map edge. Only water carries on as itself (the stream
 * keeps flowing north and south); every other special square (trunk, stair, log, start, ...) is plain ground when copied,
 * so the new squares are open, playable ground.
 */
export function parseGrid(html) {
  const base = new Map();
  for (const m of html.matchAll(/title="\((\d+),(\d+)\) ([^,"]+), elevation \+(\d+) feet[^"]*"/g)) {
    const kind = KIND_OF[m[3]];
    if (!kind) { throw new Error(`Unknown terrain label "${m[3]}" at (${m[1]},${m[2]})`); }
    base.set(`${m[1]},${m[2]}`, { kind, elev: Number(m[4]) });
  }
  if (base.size !== BASE_COLS * BASE_ROWS) { throw new Error(`Expected ${BASE_COLS * BASE_ROWS} cells, parsed ${base.size}`); }
  const clamp = (v, hi) => Math.max(1, Math.min(hi, v));
  const cells = new Map();
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const oc = c - PAD, or = r - PAD;
      const ext = oc < 1 || oc > BASE_COLS || or < 1 || or > BASE_ROWS;
      const src = base.get(`${clamp(oc, BASE_COLS)},${clamp(or, BASE_ROWS)}`);
      const kind = ext ? (src.kind === 'stream' ? 'stream' : 'trail') : src.kind;
      cells.set(`${c},${r}`, { c, r, kind, elev: src.elev, ext });
    }
  }
  const at = (c, r) => cells.get(`${c},${r}`);
  const of = (...kinds) => [...cells.values()].filter((cell) => kinds.includes(cell.kind));
  return { cells, at, of };
}
