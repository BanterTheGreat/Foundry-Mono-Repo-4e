// Interprets the encounter grid ONCE for the map: where the cliffs run, where the stairs are, which squares are water, trunks,
// thorns and logs. The scene and the renderer-facing steps all read this object; none of them re-reads the grid, so a change of
// interpretation is a one-place edit.
import { COLS, ROWS, S } from './grid.mjs';

const px = (c) => c * S; // a grid line index (0..COLS) in pixels

/** Connected groups (4-neighbour) of cells of the given kinds, each as { cells, c1, r1, c2, r2 }. */
function components(grid, kinds) {
  const left = new Set(grid.of(...kinds).map((cell) => `${cell.c},${cell.r}`));
  const groups = [];
  for (const key of [...left]) {
    if (!left.has(key)) { continue; }
    const stack = [key], cells = [];
    left.delete(key);
    while (stack.length) {
      const [c, r] = stack.pop().split(',').map(Number);
      cells.push(grid.at(c, r));
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${c + dc},${r + dr}`;
        if (left.has(k)) { left.delete(k); stack.push(k); }
      }
    }
    const cs = cells.map((x) => x.c), rs = cells.map((x) => x.r);
    groups.push({ cells, c1: Math.min(...cs), r1: Math.min(...rs), c2: Math.max(...cs), r2: Math.max(...rs) });
  }
  return groups.sort((a, b) => a.r1 - b.r1 || a.c1 - b.c1);
}

/**
 * Height-change edges that need a cliff: every border between two squares of different elevation, unless either square is a
 * stair (stairs are the walkable access, so the drop is not a cliff there). Collinear neighbours with the same high side are
 * merged into one run, so each run is continuous (mapping rule 7). `n` is the unit normal pointing to the HIGH side.
 */
function cliffRuns(grid) {
  const edges = [];
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const a = grid.at(c, r);
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const b = grid.at(c + dc, r + dr);
        if (!b || a.elev === b.elev || a.kind === 'stair' || b.kind === 'stair') { continue; }
        const aHigh = a.elev > b.elev;
        if (dc) { edges.push({ vertical: true, line: px(c), from: (r - 1) * S, to: r * S, n: [aHigh ? -1 : 1, 0], drop: Math.abs(a.elev - b.elev) }); }
        else { edges.push({ vertical: false, line: px(r), from: (c - 1) * S, to: c * S, n: [0, aHigh ? -1 : 1], drop: Math.abs(a.elev - b.elev) }); }
      }
    }
  }
  const runs = [];
  const groupKey = (e) => `${e.vertical}|${e.line}|${e.n}`;
  const byKey = new Map();
  for (const e of edges) { (byKey.get(groupKey(e)) ?? byKey.set(groupKey(e), []).get(groupKey(e))).push(e); }
  for (const list of byKey.values()) {
    list.sort((x, y) => x.from - y.from);
    let cur = null;
    for (const e of list) {
      if (cur && Math.abs(cur.to - e.from) < 0.5) { cur.to = e.to; cur.drop = Math.max(cur.drop, e.drop); }
      else { cur = { ...e }; runs.push(cur); }
    }
  }
  return runs.map((e) => ({
    vertical: e.vertical, line: e.line, from: e.from, to: e.to, n: e.n, drop: e.drop,
    a: e.vertical ? [e.line, e.from] : [e.from, e.line],
    b: e.vertical ? [e.line, e.to] : [e.to, e.line],
  }));
}

/** Stair blocks: the walkable ascents. `axis` is the direction of climb; `width` runs across it. */
function stairBlocks(grid) {
  return components(grid, ['stair']).map((g) => {
    const w = g.c2 - g.c1 + 1, h = g.r2 - g.r1 + 1;
    let axis;
    if (w > h) { axis = 'y'; } else if (h > w) { axis = 'x'; } else {
      // a square block climbs along the axis whose lines are level: its columns share one height when it climbs west-east
      const cols = new Set(g.cells.map((cell) => `${cell.c}:${cell.elev}`)).size;
      const rows = new Set(g.cells.map((cell) => `${cell.r}:${cell.elev}`)).size;
      axis = cols < rows ? 'x' : 'y';
    }
    const x0 = (g.c1 - 1) * S, x1 = g.c2 * S, y0 = (g.r1 - 1) * S, y1 = g.r2 * S;
    return { ...g, axis, x0, x1, y0, y1, w, h };
  });
}

/** Everything the scene needs, derived once from the grid. */
export function deriveStructure(grid) {
  const centre = (cell) => [(cell.c - 0.5) * S, (cell.r - 0.5) * S];
  const water = grid.of('stream', 'plank'); // the plank crossing spans the stream, which still flows underneath
  return {
    water,
    poolsAndStream: grid.of('stream'),
    cliffs: cliffRuns(grid),
    stairs: stairBlocks(grid),
    trunks: components(grid, ['trunk']),
    thorns: components(grid, ['thorn'])[0],
    logs: components(grid, ['log']),
    plank: components(grid, ['plank'])[0],
    exits: grid.of('exit'),
    start: grid.of('start'),
    cache: grid.of('cache')[0],
    centre,
  };
}
