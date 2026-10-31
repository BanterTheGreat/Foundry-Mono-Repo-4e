// Grappa's safehouse encounter grid (output/maps/grappa-safehouse.json, the data behind the tactics map) as data, extended at the
// user's request: three squares of outside street on the east side and a two-square corridor along the south side that leads to
// the front doors. The original 16 x 14 grid keeps its numbering (north-west origin), so every coordinate in
// output/grappa-safehouse-tactics.md still points at the same square.
export const S = 256; // px per 5 ft square
export const BASE_COLS = 16;
export const BASE_ROWS = 14;
export const STREET_COLS = 3; // added on the east
export const CORRIDOR_ROWS = 2; // added on the south
export const COLS = BASE_COLS + STREET_COLS;
export const ROWS = BASE_ROWS + CORRIDOR_ROWS;

/** The JSON's terrain lists, mapped to the kinds this map works with. Anything the JSON does not list is plain floor, except the border squares, which are the outer wall. */
const KIND_OF_LIST = { wall: 'wall', door: 'door', bench: 'bench', machine: 'machine', scrap: 'scrap' };

/**
 * Parse the encounter and return the extended grid.
 * `cells` maps "c,r" (1-based) to { c, r, kind }. Kinds: wall, door, floor, bench (low furniture / crates: cover), machine (tall
 * cupboards or crate stacks: impassable), scrap (scattered belongings: difficult terrain), street (the new east strip, including
 * the corner where it meets the corridor) and corridor (the new south strip west of the street).
 *
 * @param {{columns: number, rows: number, terrain: Record<string, number[][]>, deployment: object[], escapeRoute: number[][]}} json
 * @returns {{cells: Map<string, {c: number, r: number, kind: string}>, at: Function, of: Function, deployment: object[], escapeRoute: number[][]}}
 */
export function parseGrid(json) {
  if (json.columns !== BASE_COLS || json.rows !== BASE_ROWS) {
    throw new Error(`Expected a ${BASE_COLS} x ${BASE_ROWS} encounter, found ${json.columns} x ${json.rows}`);
  }
  const base = new Map();
  for (const [list, cells] of Object.entries(json.terrain)) {
    const kind = KIND_OF_LIST[list];
    if (!kind) { throw new Error(`Unknown terrain list "${list}"`); }
    for (const [c, r] of cells) {
      const had = base.get(`${c},${r}`);
      // the source lists every doorway square under "wall" as well as "door"; the doorway wins
      if (had && !(new Set([had, kind]).size === 2 && [had, kind].includes('door') && [had, kind].includes('wall'))) {
        throw new Error(`Square (${c},${r}) is listed twice`);
      }
      if (kind === 'door' || !had) { base.set(`${c},${r}`, kind); }
    }
  }
  const cells = new Map();
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      let kind;
      if (c > BASE_COLS) { kind = 'street'; }
      else if (r > BASE_ROWS) { kind = 'corridor'; }
      else {
        // the source lists only the interior partitions; the outer ring is every border square that is not a doorway
        const border = c === 1 || c === BASE_COLS || r === 1 || r === BASE_ROWS;
        kind = base.get(`${c},${r}`) ?? (border ? 'wall' : 'floor');
      }
      cells.set(`${c},${r}`, { c, r, kind });
    }
  }
  const at = (c, r) => cells.get(`${c},${r}`);
  const of = (...kinds) => [...cells.values()].filter((cell) => kinds.includes(cell.kind));
  return { cells, at, of, deployment: json.deployment, escapeRoute: json.escapeRoute };
}
