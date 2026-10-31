// Composes Grappa's safehouse (a Flint kidnapping scene in the ZEITGEIST campaign) as plain data: patterns, walls with openings,
// paths (the BW shadows) and objects. Follows the user's mapping rules (see the dungeondraft skill):
//  1 object scale stays within 0.8-1.2        2 no object shadows (the exporter writes them off)
//  3 plenty of small ground clutter, denser on difficult terrain      4 props sit loosely, not perfectly inside squares
//  5 one wall line per wall square, on the edge facing the open side  6 buildings from walls + patterns, no cave/building tool
//  7 elevation: none here (the map is flat)
// Plus the Baileywiki shadows (half shadows along every wall on layer 400 above the props, circles under the big props) and the
// standing clutter calibration.
//
// Look: Flint, the soot-choked industrial heart of Risur. Red brick and grey granite, cobbled streets worn to dirt, gas lamps,
// copper pipework, crates of freight, clockwork and cogs where a mindmaker worked. The new east strip is a three-square street
// (a pavement beside the building and a two-square carriageway with the kidnappers' wagon at the back door); the new south strip
// is a two-square service corridor between the safehouse and a granite neighbour, closed at its west end, leading to the front
// doors and opening onto the street.
// Deterministic for a given seed. Needs the texture index (index/build-index.mjs).
import { blob, decompose, distToSegment, rectPolygon, seededRandom } from '../../lib/geometry.mjs';
import { findTexture } from '../../lib/packs.mjs';
import { CLUTTER_CUTS, CRATE_SPECS, SCALE_MAX, SCALE_MIN, WALL_LAMPS, applyClutterCuts, assertThemes, buildObject, circleShadows, clamp, makeFam, onWall, patternRecord, randomHelpers, shadowPathRecord, wallRecord } from '../../lib/scene-kit.mjs';
import { SHADOW_LAYER } from '../../lib/shadows.mjs';
import { COLS, ROWS, S, parseGrid } from './grid.mjs';
import { deriveStructure, wallStretches } from './structure.mjs';

export { CLUTTER_CUTS, SCALE_MAX, SCALE_MIN };

/** Shadow strengths: the outer ring and the interior partitions cast the darker band, the neighbouring corridor wall a softer one. */
export const WALL_SHADOW = { outer: '075', partition: '050', corridor: '050' };
/** Contact shadow where the wall mass meets the floor (a tight band on the floor side). */
export const MASS_SHADOW = { edge: 'half', size: 'small', strength: '050' };

/**
 * Layers: ground clutter on 100, furniture 200, items on top of furniture and the tallest props 300, wall-mounted lamps 700 (above
 * walls). The user's shadow-path rule: shadow PATHS sit on 400, the highest user layer below the walls, so they shade the props they
 * fall on; no prop may use 400. Shadow CIRCLES are objects and stay under everything on the shared shadow layer.
 */
export const LAYER = { shadow: SHADOW_LAYER, shadowPath: 400, clutter: 100, furniture: 200, onTop: 300, tall: 300, aboveWalls: 700 };

export function composeScene(json, { seed = 20261031, clutterCuts = CLUTTER_CUTS } = {}) {
  const grid = parseGrid(json);
  const st = deriveStructure(grid); // walls, rooms, doorways and zones, interpreted once; everything below reads it
  const rng = seededRandom(seed);
  const { rr, pick } = randomHelpers(rng);
  const W = COLS * S, H = ROWS * S;
  const T = findTexture;
  const cx = (c) => (c - 0.5) * S, cy = (r) => (r - 0.5) * S;

  const objects = [];
  const bigProps = []; // circles that ground clutter keeps away from
  const clutterCircles = [];
  const clutterObjects = []; // the placed ground-clutter entries of `objects`, so the cuts can thin exactly these
  const casters = []; // the biggest props, which get a circular shadow: { x, y, size, strength }

  /** Place one object. `scale` is used as given; `px` asks for a size and is clamped into the allowed scale range. `keep` registers it as an obstacle for clutter. */
  function place(tex, x, y, { scale, px, rot = 0, mirror = false, layer = LAYER.furniture, keep = false, cast = null } = {}) {
    const { object: o, radius: r } = buildObject(tex, x, y, { scale, px, rot, mirror, layer });
    objects.push(o);
    if (keep) { bigProps.push({ x, y, r: r * (keep === true ? 0.9 : keep) }); }
    if (cast) { casters.push({ x, y, size: r * 2, strength: cast }); }
    return o;
  }
  const fam = makeFam(200);

  // ---------- floors and ground (patterns) ----------
  // Layers: -400 for every base surface (none overlap), -100 for worn dirt, 100 for broken paving over it. Overlapping patterns always sit on different layers, and every pattern is at or below the
  // lowest prop layer, so draw order never depends on file order and nothing covers a prop.
  const patterns = [];
  const pattern = (spec, points, layer) => { patterns.push(patternRecord(T(spec), points, layer)); };
  const cellRect = ({ c1, r1, c2, r2 }) => rectPolygon((c1 - 1) * S, (r1 - 1) * S, c2 * S, r2 * S);
  const zoneRect = (z) => rectPolygon(z.x0, z.y0, z.x1, z.y1);
  const { zones } = st;

  pattern('Interior:cobbles_1c:patterns', zoneRect(zones.road), -400); // the carriageway: soot-dark cobbles
  pattern('Buildings:Stone_Sidewalk:patterns', zoneRect(zones.pavement), -400); // flagged pavement along the building
  pattern('Scenes:bricks_street_2b:patterns', zoneRect(zones.corridor), -400); // grimy brick paving in the service corridor
  // wall mass is brick masonry underfoot; each room has its own floor; the doorway squares are plank thresholds
  for (const rect of decompose(st.massCells, COLS, ROWS)) { pattern('Scenes:bricks_street_2c:patterns', cellRect(rect), -400); }
  const ROOM_FLOOR = { records: 'Dungeondraft:planks_1b:patterns', store: 'Seasons:Stone_Tiled_Medium:patterns', common: 'Scenes:tiles_street_1a:patterns' };
  for (const room of st.rooms) { for (const rect of decompose(room.cells, COLS, ROWS)) { pattern(ROOM_FLOOR[room.name], cellRect(rect), -400); } }
  for (const rect of decompose(st.doorKeys, COLS, ROWS)) { pattern('Dungeondraft:planks_1b:patterns', cellRect(rect), -400); }
  // worn carriageway: dark gravelly dirt with broken paving over it, kept clear of the pavement's wall shadow
  const wornStreet = [[17.95 * S, 8.9 * S, 300, 430], [18.6 * S, 12.6 * S, 230, 330], [18.05 * S, 1.0 * S, 260, 260], [18.45 * S, 15.1 * S, 230, 200]];
  for (const [bx, by, rx, ry] of wornStreet) {
    const outline = blob(rng, bx, by, rx, ry, { n: 28, jitter: 0.22 }).map(([x, y]) => [clamp(x, zones.road.x0 + 20, zones.road.x1 - 20), clamp(y, 0, H)]);
    pattern('Elements:rock_to_dirt:patterns', outline, -100);
    pattern('Scenes:brick_street_broken_1a:patterns', outline, 100);
  }

  // ---------- walls (rule 5): one thin line per wall, doorways cut into it ----------
  const door = T('Buildings:door_wood_14:portals');
  const WALL_TEXTURE = { outer: 'Buildings:bricks:walls', partition: 'Buildings:bricks:walls', corridor: 'Scenes:wall1a:walls' };
  const wallKind = (w) => (w.id === 'outer' ? 'outer' : w.id === 'corridor' ? 'corridor' : 'partition');
  const walls = st.walls.map((w) => wallRecord(T(WALL_TEXTURE[wallKind(w)]), w, door));
  const wallPieces = st.walls.flatMap((w) => wallStretches(w));

  // ---------- wall mass: detail that fills the wall squares behind each wall line ----------
  // Shelves and lanterns are drawn with their mounting edge at the top, so rotation 0 faces a north wall; each side turns them
  // a quarter turn. Doorways are flanked by stone posts and kept clear.
  const SHELVES = [['Buildings:Shelf_Wall_Deep:objects', 118], ['Buildings:Shelf_Wall_Small:objects', 64], ['Buildings:Shelf_Wall_Worn:objects', 120], ['Buildings:Shelf_Wall_Worn_Small:objects', 40], ['Buildings:Wall_Shelf_Broken_01:objects', 80]];
  const POSTS = ['Buildings:Pillar_Stone_01:objects', 'Buildings:pillar_stone_05:objects', 'Buildings:pillar_stone_10:objects', 'Buildings:pillar_stone_06:objects'];
  const LAMPS = WALL_LAMPS;
  let wallDetail = 0;
  const post = (x, y, px) => { place(T(pick(POSTS)), x, y, { px, rot: rr(-0.1, 0.1), layer: LAYER.furniture, keep: true }); wallDetail++; };
  let sinceShelf = 0;
  for (const cell of st.band) {
    const { rot } = cell;
    if (cell.corner) {
      const [x, y] = onWall(S, cell, 128, 0);
      post(x + rr(-14, 14), y + rr(-14, 14), rr(205, 220)); // corner buttress filling the square
      place(T(pick(['Dungeondraft:web_03:objects', 'Dungeondraft:web_06:objects'])), x, y, { scale: rr(0.85, 1), rot: rr(0, 6.28), layer: LAYER.onTop });
      wallDetail++;
      continue;
    }
    if (cell.nextToDoor) {
      const [x, y] = onWall(S, cell, 120, 0);
      post(x + rr(-12, 12), y + rr(-12, 12), rr(120, 150)); // door post
      continue;
    }
    sinceShelf++;
    if (sinceShelf >= 2 || rng() < 0.5) {
      sinceShelf = 0;
      const [spec, depth] = pick(SHELVES);
      const tex = T(spec);
      const s = rr(0.85, 1.05);
      const [x, y] = onWall(S, cell, depth * s / 2 + rr(0, 10), rr(-40, 40));
      place(tex, x, y, { scale: s, rot: rot + rr(-0.03, 0.03), layer: LAYER.furniture, keep: (depth * s * 0.55) / (Math.max(tex.w, tex.h) * s / 2) });
      wallDetail++;
      if (rng() < 0.5) {
        const [lx, ly] = onWall(S, cell, 80 + rr(0, 20), rr(-70, 70));
        place(T(pick(LAMPS)), lx, ly, { scale: rr(0.9, 1.05), rot: rot + rr(-0.06, 0.06), layer: LAYER.onTop });
        wallDetail++;
      }
    } else {
      const [x, y] = onWall(S, cell, 100, rr(-30, 30));
      post(x + rr(-8, 8), y + rr(-12, 12), rr(130, 160)); // buttress between shelves
    }
  }

  // ---------- cover and furniture: the grid's machine (tall), bench (low) and scrap (difficult) squares ----------
  /** Connected groups (4-neighbour) of squares of one kind, each with its bounding box and the room it lies in. */
  const groupsOf = (kind) => {
    const left = new Set(grid.of(kind).map(({ c, r }) => `${c},${r}`));
    const groups = [];
    for (const k of [...left]) {
      if (!left.has(k)) { continue; }
      const stack = [k], cells = [];
      left.delete(k);
      while (stack.length) {
        const [c, r] = stack.pop().split(',').map(Number);
        cells.push([c, r]);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = `${c + dc},${r + dr}`; if (left.has(n)) { left.delete(n); stack.push(n); } }
      }
      cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const cs = cells.map((x) => x[0]), rs = cells.map((x) => x[1]);
      const room = st.rooms[st.roomOf.get(`${cells[0][0]},${cells[0][1]}`)]?.name;
      groups.push({ cells, c1: Math.min(...cs), c2: Math.max(...cs), r1: Math.min(...rs), r2: Math.max(...rs), w: Math.max(...cs) - Math.min(...cs) + 1, h: Math.max(...rs) - Math.min(...rs) + 1, room });
    }
    return groups.sort((a, b) => a.r1 - b.r1 || a.c1 - b.c1);
  };
  const blockCentre = (g) => [((g.c1 - 1 + g.c2) / 2) * S, ((g.r1 - 1 + g.r2) / 2) * S];

  const { base: crateSpecs, mid: midSpecs, top: topSpecs } = CRATE_SPECS;
  const papers = [...fam('Buildings', 'paper'), ...fam('Buildings', 'paper_scatter')];
  const cabinetTop = (x, y, n) => { for (let i = 0; i < n; i++) { place(pick(papers), x + rr(-90, 90), y + rr(-50, 50), { scale: rr(0.85, 1.1), rot: rr(0, 6.28), layer: LAYER.onTop }); } };

  /** A straight run of tall cupboards along one or more squares; a three-square run is a bookcase and a two-square cabinet. */
  function cupboardRun(g) {
    const horizontal = g.w >= g.h, n = horizontal ? g.w : g.h;
    const x0 = (g.c1 - 1) * S, y0 = (g.r1 - 1) * S;
    const piece = (from, len, tex, rotBase) => {
      const along = (from + len / 2) * S + rr(-8, 8), across = S / 2 + rr(-10, 10);
      const x = horizontal ? x0 + along : x0 + across, y = horizontal ? y0 + across : y0 + along;
      const s = clamp((len * S - 8) / (rotBase === 'long' ? tex.w : Math.max(tex.w, tex.h)), SCALE_MIN, SCALE_MAX);
      place(tex, x, y, { scale: s, rot: (horizontal ? 0 : Math.PI / 2) + rr(-0.02, 0.02), layer: LAYER.furniture, keep: true });
      return [x, y];
    };
    if (n === 3) {
      piece(0, 1, T(pick(['Dungeondraft:bookcase_1a:objects', 'Dungeondraft:bookcase_2a:objects'])), 'any');
      const [x, y] = piece(1, 2, T(pick(['Foundation:cabinet1a:objects', 'Foundation:cabinet1b:objects', 'Foundation:cabinet1c:objects'])), 'long');
      if (g.room === 'records') { cabinetTop(x, y, 2); }
    } else if (n === 2) {
      const [x, y] = piece(0, 2, T(pick(['Foundation:cabinet1a:objects', 'Foundation:cabinet1b:objects', 'Foundation:cabinet1c:objects'])), 'long');
      if (g.room === 'records') { cabinetTop(x, y, 2); }
      if (g.room === 'common') {
        // a mindmaker's workshop cabinet: clockwork spares piled on top
        for (const spec of ['Buildings:Gears_Metal_05:objects', 'Buildings:Gears_Metal_01:objects']) {
          place(T(spec), x + rr(-110, 110), y + rr(-40, 40), { scale: rr(0.8, 0.95), rot: rr(0, 6.28), layer: LAYER.onTop });
        }
        casters.push({ x, y, size: 520, strength: '050' });
      }
    } else {
      piece(0, 1, T('Dungeondraft:bookcase_1a:objects'), 'any');
    }
  }

  /** A stack of crates and barrels filling a block (tall: impassable and blocks sight). */
  function crateStack(g) {
    const cells = g.cells;
    for (const [c, r] of cells) { place(T(pick(crateSpecs)), cx(c) + rr(-28, 28), cy(r) + rr(-28, 28), { px: rr(238, 252), rot: rr(-0.14, 0.14), layer: LAYER.furniture, keep: true }); }
    for (const [c, r] of [...cells].sort(() => rng() - 0.5).slice(0, Math.max(1, Math.round(cells.length * 0.75)))) {
      place(T(pick(midSpecs)), cx(c) + rr(-44, 44), cy(r) + rr(-44, 44), { px: rr(176, 214), rot: rr(-0.45, 0.45), layer: LAYER.onTop });
    }
    for (let i = 0; i < Math.max(1, Math.round(cells.length / 2)); i++) {
      const [c, r] = pick(cells);
      place(T(pick(topSpecs)), cx(c) + rr(-50, 50), cy(r) + rr(-50, 50), { px: rr(140, 215), rot: rr(-0.5, 0.5), layer: LAYER.tall });
    }
    const [bx, by] = blockCentre(g);
    casters.push({ x: bx, y: by, size: 520, strength: '050' });
  }

  /** Low crates filling a block (partial cover, difficult to cross). */
  function lowCrates(g) {
    for (const [c, r] of g.cells) { place(T(pick(crateSpecs)), cx(c) + rr(-34, 34), cy(r) + rr(-34, 34), { px: rr(236, 252), rot: rr(-0.2, 0.2), layer: LAYER.furniture, keep: true }); }
  }

  for (const g of groupsOf('machine')) {
    if (g.room === 'store') { crateStack(g); } else { cupboardRun(g); }
  }
  for (const g of groupsOf('bench')) {
    const [bx, by] = blockCentre(g);
    if (g.room === 'records') {
      // two writing desks side by side, stools, an open ledger and a lantern: where the safehouse's records were kept
      for (const dy of [-0.5 * S + 14, 0.5 * S - 14]) {
        place(T('Buildings:Desk_Writing:objects'), bx + rr(-22, 22), by + dy + rr(-10, 10), { scale: rr(1.12, 1.2), rot: rr(-0.05, 0.05), layer: LAYER.furniture, keep: true });
      }
      place(T('Scenes:book_open_1a:objects'), bx + rr(-60, 60), by - 0.5 * S + rr(-8, 14), { scale: 0.85, rot: rr(-0.3, 0.3), layer: LAYER.onTop });
      place(T('Buildings:Quill_Ink_01:objects'), bx + rr(60, 130), by + 0.5 * S + rr(-12, 12), { scale: 0.85, rot: rr(0, 1), layer: LAYER.onTop });
      place(T('Interior:lantern_1a:objects'), bx - 150 + rr(-10, 10), by + rr(-30, 30), { scale: 0.9, layer: LAYER.onTop });
      place(T('Buildings:Stool_Basic_01:objects'), bx + rr(-40, 40), by + 0.5 * S + 110 + rr(-8, 8), { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.furniture });
    } else if (g.room === 'store') {
      lowCrates(g);
    } else if (bx < 8 * S) {
      // Grappa's workbench, west common room: tools, clockwork and a stool
      place(T('Buildings:Table_Workbench:objects'), bx + rr(-16, 16), by + rr(-14, 14), { scale: 1.2, rot: rr(-0.06, 0.06), layer: LAYER.furniture, keep: true });
      place(T('Buildings:Gears_Metal_05:objects'), bx - 110 + rr(-12, 12), by + rr(-40, 40), { scale: 0.8, rot: rr(0, 6.28), layer: LAYER.onTop });
      for (const h of fam('Dungeondraft', 'hammer').slice(0, 1)) { place(h, bx + 90 + rr(-12, 12), by + rr(-40, 40), { scale: rr(0.9, 1.1), rot: rr(0, 6.28), layer: LAYER.onTop }); }
      place(T('Buildings:Stool_Basic_01:objects'), bx + rr(-70, 70), by + 0.5 * S + 120 + rr(-10, 10), { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.furniture });
    } else {
      // the common room's sitting corner, east: a couch, a low table and a stool
      place(T('Scenes:couch_1a:objects'), bx + rr(-16, 16), by - 0.5 * S - 12 + rr(-6, 6), { scale: 0.8, rot: rr(-0.04, 0.04), layer: LAYER.furniture, keep: true });
      place(T('Above&Below:table_wood_01a:objects'), bx + rr(-60, 60), by + 0.5 * S + 14 + rr(-6, 6), { scale: 1.0, rot: rr(-0.1, 0.1), layer: LAYER.furniture, keep: true });
      place(T('Buildings:Stool_Basic_01:objects'), bx + 130 + rr(-10, 10), by + 0.5 * S + rr(-10, 10), { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.furniture });
    }
  }

  // ---------- the street: the kidnappers' wagon at the back door, gas lamps, drains, a trough, pipework ----------
  const roadX0 = zones.road.x0, roadX1 = zones.road.x1, wallX = zones.pavement.x0; // 4352, 4864, 4096
  // the wagon waits just outside the rear doorway (16,3-4), its back to the building, parked half on the pavement
  place(T('Tomb & Anvil:caravan_3a:objects'), roadX1 - 304 + rr(-8, 8), 3.95 * S + rr(-20, 20), { scale: 0.8, rot: rr(-0.03, 0.03), layer: LAYER.tall, keep: true, cast: '075' });
  for (const [y, spec] of [[1.35 * S, 'Dungeondraft:lamp_1a:objects'], [7.65 * S, 'Dungeondraft:lamp_1b:objects'], [12.3 * S, 'Dungeondraft:lamp_1c:objects']]) {
    place(T(spec), roadX0 + rr(-10, 10), y + rr(-30, 30), { scale: 1.2, rot: rr(-0.1, 0.1), layer: LAYER.tall, keep: 0.6 }); // gas lamp on the kerb
  }
  place(T('Dungeondraft:trough_1a:objects'), roadX1 - 124 + rr(-8, 8), 10.2 * S + rr(-30, 30), { scale: 1.0, rot: Math.PI / 2 + rr(-0.04, 0.04), layer: LAYER.furniture, keep: true });
  place(T('Modular:grate_r_1a:objects'), roadX0 + 150 + rr(-20, 20), 12.9 * S + rr(-30, 30), { scale: 1.0, rot: rr(0, 6.28), layer: LAYER.clutter, keep: true });
  place(T('Modular:grate_1a:objects'), roadX0 + 260 + rr(-20, 20), 7.1 * S + rr(-20, 20), { scale: 1.0, rot: rr(-0.05, 0.05), layer: LAYER.clutter, keep: true });
  // freight against the building: crates, barrels and sacks on the pavement, clear of the doorway
  for (const [spec, y] of [['Buildings:Crate_Large_01:objects', 1.5 * S], ['Buildings:Barrel_Simple_Wooden_01:objects', 6.55 * S], ['Buildings:Barrel_Closed:objects', 6.95 * S], ['Buildings:Crate_03:objects', 10.8 * S], ['Buildings:Sack_Pile_01:objects', 13.2 * S]]) {
    place(T(spec), wallX + 140 + rr(-14, 14), y + rr(-24, 24), { px: rr(200, 235), rot: rr(0, 6.28), layer: LAYER.furniture, keep: true });
  }
  // copper pipework climbing the building's east face, drawn over the wall
  for (const [spec, y, s] of [['Mechanism:pipe_wheel_1a:objects', 8.6 * S, 0.9], ['Mechanism:pipe_end_1a:objects', 9.5 * S, 0.9], ['Mechanism:pipe_wheel_1a:objects', 11.9 * S, 0.9]]) {
    place(T(spec), wallX + 64 + rr(-6, 6), y + rr(-24, 24), { scale: s, rot: Math.PI / 2 + rr(-0.04, 0.04), layer: LAYER.aboveWalls });
  }
  // gas lamps on the east face either side of the rear doorway
  for (const y of [2 * S - 70, 4 * S + 70]) {
    place(T(pick(LAMPS)), wallX + 62, y + rr(-6, 6), { scale: 1.0, rot: -Math.PI / 2 + rr(-0.05, 0.05), layer: LAYER.aboveWalls }); // the wall is to the west, so the mounting edge turns west
  }

  // ---------- the corridor: gas lamps by the doors, freight along the far wall, a steam grate, a dead end ----------
  const corY0 = zones.corridor.y0, corY1 = zones.corridor.y1; // 3584, 4096
  for (const x of [6 * S - 75, 10 * S + 75]) {
    place(T(pick(LAMPS)), x + rr(-6, 6), corY0 + 92, { scale: 1.0, rot: rr(-0.05, 0.05), layer: LAYER.aboveWalls }); // on the building face, flanking the front doors
  }
  for (const x of [3.3 * S, 8.4 * S, 13.6 * S]) {
    place(T(pick(LAMPS)), x + rr(-30, 30), corY1 - 92, { scale: 1.0, rot: Math.PI + rr(-0.05, 0.05), layer: LAYER.aboveWalls }); // on the neighbouring wall
  }
  for (const [spec, x, y] of [
    ['Buildings:Crate_Large_02:objects', 11.4 * S, corY1 - 135], ['Buildings:Barrel_Simple_Wooden_02:objects', 12.1 * S, corY1 - 120],
    ['Buildings:Crate_01:objects', 14.3 * S, corY1 - 130], ['Buildings:Sack_Pile_01:objects', 15.1 * S, corY1 - 115],
    ['Buildings:Crate_03:objects', 0.62 * S, corY1 - 140], ['Buildings:Crate_Large_01:objects', 0.75 * S, corY0 + 150],
  ]) { place(T(spec), x + rr(-18, 18), y + rr(-14, 14), { px: rr(190, 235), rot: rr(0, 6.28), layer: LAYER.furniture, keep: true }); }
  place(T('Tomb & Anvil:wheelbarrow_1a:objects'), 2.0 * S + rr(-20, 20), corY1 - 125 + rr(-8, 8), { scale: 0.9, rot: Math.PI / 2 + rr(-0.15, 0.15), layer: LAYER.furniture, keep: true });
  place(T('Buildings:Grate_Small_01:objects'), 3.9 * S + rr(-20, 20), corY0 + 128 + rr(-14, 14), { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.clutter, keep: true }); // a steam vent
  place(T('Modular:grate_1a:objects'), 13.2 * S + rr(-20, 20), corY0 + 140 + rr(-14, 14), { scale: 1.0, rot: rr(-0.05, 0.05), layer: LAYER.clutter, keep: true });

  // ---------- clutter (rule 3): clustered by theme, piled against walls, and sprinkled about ----------
  // ground detail stays small: 30-200 px on its longest side
  const THEMES = {
    stones: [fam('Seasons', 'rock_stone'), fam('Seasons', 'rock_dirt'), fam('Death', 'rubble_white'), fam('Buildings', 'debris_stonewall'), fam('Buildings', 'debris_stone_pile')],
    litter: [fam('Buildings', 'paper'), fam('Buildings', 'paper_scatter'), fam('Above&Below', 'gold_coins'), fam('Buildings', 'coin_pouch'), fam('Dungeondraft', 'feather'), fam('Dungeondraft', 'bottle'), fam('Buildings', 'mug'), fam('Buildings', 'cloth_rag_stained')],
    wood: [fam('Buildings', 'debris_wood_pile'), fam('Buildings', 'broken_plank'), fam('Interior', 'rubble_wood'), fam('Buildings', 'broken_crate_small'), fam('Buildings', 'barrel_lid')],
    weeds: [fam('Buildings', 'plant_grass_patch'), fam('Dungeondraft', 'grass'), fam('Seasons', 'grass')],
    soot: [fam('Above&Below', 'coal'), fam('Death', 'rubble_white'), fam('Seasons', 'rock_dirt'), fam('Buildings', 'debris_stone_pile')],
    trash: [fam('Scenes', 'trashcan_fallen'), fam('Scenes', 'trashcan'), fam('Buildings', 'cloth_rag_stained'), fam('Buildings', 'broken_crate_small')],
    spill: [fam('Buildings', 'sack_open_spilled'), fam('Seasons', 'hay_stack'), fam('Buildings', 'bucket_water'), fam('Seasons', 'tools_bucket')],
    spillIndoor: [fam('Buildings', 'sack_open_spilled'), fam('Buildings', 'bucket_water'), fam('Seasons', 'tools_bucket'), fam('Buildings', 'mug')], // no loose hay among the records
    vermin: [fam('Buildings', 'rat'), fam('Dungeondraft', 'mouse')],
    // difficult terrain: a ransacked safehouse's scattered belongings, per room
    ransacked: [fam('Buildings', 'paper'), fam('Buildings', 'paper_scatter'), fam('Buildings', 'cloth_rag_stained'), fam('Dungeondraft', 'feather'), fam('Dungeondraft', 'bottle'), fam('Buildings', 'mug'), fam('Buildings', 'coin_pouch')],
    spilledStore: [fam('Buildings', 'sack_open_spilled'), fam('Seasons', 'hay_stack'), fam('Buildings', 'broken_crate_small'), fam('Buildings', 'debris_wood_pile'), fam('Buildings', 'paper')],
  };
  assertThemes(THEMES);
  const OUTDOOR = ['stones', 'stones', 'litter', 'litter', 'wood', 'soot', 'soot', 'weeds', 'spill', 'trash', 'vermin'];
  const INDOOR = ['litter', 'litter', 'litter', 'wood', 'wood', 'spillIndoor', 'litter', 'spillIndoor', 'vermin']; // one lone rat in nine // no loose stones, soot or weeds indoors

  const inZone = (z, x, y, m) => x > z.x0 + m && x < z.x1 - m && y > z.y0 + m && y < z.y1 - m;
  const outdoorOk = (x, y) => inZone({ x0: zones.pavement.x0 + 20, y0: 0, x1: W, y1: H }, x, y, 30) || inZone({ x0: 0, y0: zones.corridor.y0, x1: zones.pavement.x0 + 30, y1: H }, x, y, 30);
  const floorKinds = new Set(['floor', 'bench', 'machine', 'scrap']);
  const floorSquare = (x, y) => { const cell = grid.at(Math.floor(x / S) + 1, Math.floor(y / S) + 1); return cell && (floorKinds.has(cell.kind) || cell.kind === 'door') && st.floorCells.has(`${cell.c},${cell.r}`); };
  const indoorOk = (x, y) => floorSquare(x, y) && floorSquare(x - 40, y) && floorSquare(x + 40, y) && floorSquare(x, y - 40) && floorSquare(x, y + 40);

  function scatterOne(themeName, x, y, ok) {
    const tex = pick(pick(THEMES[themeName]));
    const scale = rr(0.85, 1.15);
    const r = (Math.max(tex.w, tex.h) * scale) / 2 * 0.75;
    if (!ok(x, y)) { return false; }
    if (wallPieces.some((seg) => distToSegment(x, y, seg) < 46 + r * 0.6)) { return false; }
    if (bigProps.some((p) => Math.hypot(p.x - x, p.y - y) < r + p.r * 0.95)) { return false; }
    if (clutterCircles.some((p) => Math.hypot(p.x - x, p.y - y) < 0.55 * (r + p.r))) { return false; }
    place(tex, x, y, { scale, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.clutter });
    clutterObjects.push(objects[objects.length - 1]);
    clutterCircles.push({ x, y, r });
    return true;
  }
  /** A cluster of one theme around a centre from `centreFn`, a few attempts per item. */
  function cluster(themes, centreFn, ok, size) {
    const theme = pick(themes);
    if (theme === 'vermin') { size = 1; } // a lone rat, never a swarm
    const [px, py] = centreFn();
    const spread = rr(90, 190);
    let placed = 0;
    for (let i = 0; i < size * 6 && placed < size; i++) {
      if (scatterOne(theme, px + rr(-spread, spread), py + rr(-spread, spread), ok)) { placed++; }
    }
  }
  // wall bases: outdoors along the open (left) side of every standing stretch of the outer wall and the corridor wall; indoors
  // along the floor side of the wall mass
  const outdoorWalls = st.walls.filter((w) => w.id === 'outer' || w.id === 'corridor').flatMap((w) => wallStretches(w));
  const outdoorLens = outdoorWalls.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  function outdoorWallBase(themes) {
    let t = rng() * outdoorLens.reduce((x, y) => x + y, 0), i = 0;
    while (t > outdoorLens[i]) { t -= outdoorLens[i]; i++; }
    const [a, b] = outdoorWalls[i];
    const ux = (b[0] - a[0]) / outdoorLens[i], uy = (b[1] - a[1]) / outdoorLens[i];
    const off = rr(52, 130); // left of travel = the open side
    scatterOne(pick(themes), a[0] + ux * t + uy * off, a[1] + uy * t - ux * off, outdoorOk);
  }
  const massEdges = []; // a floor square beside wall mass: the mid-point of the shared edge and the unit normal into the floor
  for (const k of st.floorCells) {
    const [c, r] = k.split(',').map(Number);
    if (st.doorKeys.has(k)) { continue; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (st.massCells.has(`${c + dc},${r + dr}`)) { massEdges.push({ x: cx(c) + dc * S / 2, y: cy(r) + dr * S / 2, nx: -dc, ny: -dr }); } }
  }
  function indoorWallBase(themes) {
    const e = pick(massEdges);
    const along = rr(-S / 2 + 30, S / 2 - 30), off = rr(52, 130);
    scatterOne(pick(themes), e.x - e.ny * along + e.nx * off, e.y + e.nx * along + e.ny * off, indoorOk);
  }
  const indoorSquares = [...st.floorCells].filter((k) => !st.doorKeys.has(k)).map((k) => k.split(',').map(Number));
  const indoorCentre = () => { const [c, r] = pick(indoorSquares); return [cx(c) + rr(-90, 90), cy(r) + rr(-90, 90)]; };
  const outdoorCentre = () => (rng() < 0.55
    ? [rr(zones.pavement.x0 + 60, W - 60), rr(60, H - 60)]
    : [rr(60, zones.pavement.x0 - 60), rr(zones.corridor.y0 + 40, H - 40)]);

  // Clutter is placed at the full layout below; the cuts are applied afterwards (see the thinning step).
  for (let i = 0; i < 14; i++) { cluster(OUTDOOR, outdoorCentre, outdoorOk, 3 + Math.floor(rng() * 4)); }
  for (let i = 0; i < 55; i++) { outdoorWallBase(OUTDOOR); }
  for (let i = 0; i < 20; i++) { cluster(OUTDOOR, outdoorCentre, outdoorOk, 1); }
  for (let i = 0; i < 11; i++) { cluster(INDOOR, indoorCentre, indoorOk, 3 + Math.floor(rng() * 3)); }
  for (let i = 0; i < 45; i++) { indoorWallBase(INDOOR); }
  for (let i = 0; i < 28; i++) { cluster(INDOOR, indoorCentre, indoorOk, 1); }
  // difficult terrain (rule 3): scattered belongings fill the scrap squares, several times denser than the ordinary ground
  const scrapTheme = (room) => (room === 'store' ? 'spilledStore' : 'ransacked');
  for (const { c, r } of grid.of('scrap')) {
    const theme = scrapTheme(st.rooms[st.roomOf.get(`${c},${r}`)].name);
    const inSquare = (x, y) => x > (c - 1) * S + 40 && x < c * S - 40 && y > (r - 1) * S + 40 && y < r * S - 40;
    for (let n = 0, placed = 0; n < 40 && placed < 6; n++) {
      if (scatterOne(theme, cx(c) + rr(-100, 100), cy(r) + rr(-100, 100), inSquare)) { placed++; }
    }
  }

  // Apply the clutter cuts exactly: a seeded share of what was placed is removed (see applyClutterCuts in lib/scene-kit.mjs).
  const clutterKept = applyClutterCuts(objects, clutterObjects, seed, clutterCuts);

  // ---------- shadows (Baileywiki BW pack): wall lines, wall-mass edges and the biggest props ----------
  // Composed last from their own RNG so the layout above does not move. Neither is a placed prop: the circles are exempt from
  // the 0.8-1.2 scale range (rule 1), as in the user's own touch-ups, and sit below every other object.
  const paths = [];
  const mkShadowPath = (options, points, role) => { paths.push(shadowPathRecord(T, options, points, LAYER.shadowPath, role)); };
  // a half shadow fades to the LEFT of travel; every wall polyline is ordered so that is its open side (see structure.mjs)
  for (const w of st.walls) {
    const strength = WALL_SHADOW[wallKind(w)];
    for (const stretch of wallStretches(w)) { mkShadowPath({ edge: 'half', size: 'large', strength }, stretch, 'wall'); }
  }
  // where the one-square wall mass meets the floor, a tight contact shadow falls on the floor side. Collinear neighbouring
  // squares with the same floor side merge into one run.
  const massRuns = [];
  {
    const edges = [];
    for (const k of st.massCells) {
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!st.floorCells.has(`${c + dc},${r + dr}`)) { continue; }
        // the shared edge and the travel direction that puts the floor side on the left: left of (dx, dy) is (dy, -dx)
        const dx = -dr, dy = dc; // rotate the outward normal (dc, dr) a quarter turn clockwise on screen so that left = (dy, -dx) = (dc, dr)
        const line = dc ? (dc > 0 ? c * S : (c - 1) * S) : (dr > 0 ? r * S : (r - 1) * S);
        const lo = dc ? (r - 1) * S : (c - 1) * S;
        edges.push({ vertical: dc !== 0, line, lo, hi: lo + S, dx, dy });
      }
    }
    const groups = new Map();
    for (const e of edges) { const g = `${e.vertical}|${e.line}|${e.dx},${e.dy}`; (groups.get(g) ?? groups.set(g, []).get(g)).push(e); }
    for (const list of groups.values()) {
      list.sort((a, b) => a.lo - b.lo);
      let cur = null;
      for (const e of list) {
        if (cur && Math.abs(cur.hi - e.lo) < 0.5) { cur.hi = e.hi; } else { cur = { ...e }; massRuns.push(cur); }
      }
    }
    for (const run of massRuns) {
      const a = run.vertical ? [run.line, run.lo] : [run.lo, run.line], b = run.vertical ? [run.line, run.hi] : [run.hi, run.line];
      const forward = run.vertical ? run.dy > 0 : run.dx > 0; // travel in the +x / +y direction, or the opposite
      mkShadowPath(MASS_SHADOW, forward ? [a, b] : [b, a], 'mass');
    }
  }
  let propShadows = 0;
  for (const { object } of circleShadows(casters, { seed, sizePerScale: 520, T })) {
    objects.push(object);
    propShadows++;
  }

  const terrain = { textures: [T('Seasons:ch_dirtdark_detail:terrain'), null, null, null] };
  return {
    world: { cols: COLS, rows: ROWS, size: S }, terrain, patterns, walls, paths, objects, structure: st,
    stats: { clutter: clutterKept, clutterPlaced: clutterObjects.length, wallDetail, objects: objects.length, paths: paths.length, wallShadows: paths.filter((p) => p.role === 'wall').length, massShadows: massRuns.length, propShadows },
  };
}
