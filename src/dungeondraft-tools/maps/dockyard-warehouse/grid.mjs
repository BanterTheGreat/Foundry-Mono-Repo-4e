// The encounter's read-only grid (artifacts/dockyard-warehouse.html) as data. Cells are titled
// "Column c, row r: <terrain>"; terrain labels are free text per encounter, so they are named once here.
export const COLS = 18;
export const ROWS = 14;
export const S = 256; // px per 5 ft square

export const LABEL = {
  WALL: 'Warehouse wall',
  DOOR: 'Open loading door',
  WATER: 'Harbour water',
  LOW: 'Waist-high crates',
  TALL: 'Tall cargo stack',
  LEDGER: 'Ledger on desk',
  LADDER: 'Dock ladder',
};

/**
 * Parse the grid. Returns { type, cells(label), ring, doorCells } where `type["c,r"]` is the terrain label,
 * `ring` is the bounding box (1-based cell numbers) of the wall squares, and `doorCells` are the open door squares.
 * Throws unless the wall and door squares form exactly one rectangular ring, which the wall layout relies on.
 */
export function parseGrid(html) {
  const type = {};
  for (const m of html.matchAll(/title="Column (\d+), row (\d+): ([^",]+)(?:, [A-Z]\.\d)?"/g)) { type[`${m[1]},${m[2]}`] = m[3]; }
  if (Object.keys(type).length !== COLS * ROWS) { throw new Error(`Expected ${COLS * ROWS} cells, parsed ${Object.keys(type).length}`); }
  const cells = (label) => Object.entries(type).filter(([, t]) => t === label).map(([k]) => k.split(',').map(Number));
  const walls = cells(LABEL.WALL);
  const doorCells = cells(LABEL.DOOR);
  const ring = {
    c1: Math.min(...walls.map((c) => c[0])), c2: Math.max(...walls.map((c) => c[0])),
    r1: Math.min(...walls.map((c) => c[1])), r2: Math.max(...walls.map((c) => c[1])),
  };
  const expected = new Set();
  for (let c = ring.c1; c <= ring.c2; c++) { expected.add(`${c},${ring.r1}`); expected.add(`${c},${ring.r2}`); }
  for (let r = ring.r1; r <= ring.r2; r++) { expected.add(`${ring.c1},${r}`); expected.add(`${ring.c2},${r}`); }
  const have = new Set([...walls, ...doorCells].map(([c, r]) => `${c},${r}`));
  if (expected.size !== have.size || [...expected].some((k) => !have.has(k))) { throw new Error('Wall and door squares do not form a rectangular ring'); }
  for (const [c, r] of doorCells) {
    if ((c === ring.c1 || c === ring.c2) === (r === ring.r1 || r === ring.r2)) { throw new Error(`Door (${c},${r}) must sit on exactly one side of the ring`); }
  }
  return { type, cells, ring, doorCells };
}

/** Connected rectangular blocks of one terrain label (all cargo blocks in this encounter are rectangles). */
export function blocksOf(grid, label) {
  const mine = new Set(grid.cells(label).map(([c, r]) => `${c},${r}`));
  const seen = new Set();
  const out = [];
  for (const key of [...mine].sort((a, b) => Number(a.split(',')[1]) - Number(b.split(',')[1]) || Number(a.split(',')[0]) - Number(b.split(',')[0]))) {
    if (seen.has(key)) { continue; }
    const [c, r] = key.split(',').map(Number);
    let c2 = c; while (mine.has(`${c2 + 1},${r}`)) { c2++; }
    let r2 = r; while (Array.from({ length: c2 - c + 1 }, (_, i) => mine.has(`${c + i},${r2 + 1}`)).every(Boolean)) { r2++; }
    for (let a = c; a <= c2; a++) { for (let b = r; b <= r2; b++) { seen.add(`${a},${b}`); } }
    out.push({ c1: c, c2, r1: r, r2 });
  }
  return out;
}
