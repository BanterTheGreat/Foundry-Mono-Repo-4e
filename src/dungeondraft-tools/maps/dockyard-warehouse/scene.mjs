// Composes the Salt Ledger dockyard warehouse as plain data (patterns, walls, openings, terrain, objects).
// Follows the user's mapping rules (see the dungeondraft skill):
//  1 object scale stays within 0.8-1.2        2 no object shadows (the exporter writes them off)
//  3 plenty of small ground clutter           4 props sit loosely, not perfectly inside squares
//  5 one wall on each wall square's outer edge  6 buildings from walls + patterns + terrain, no cave/building tool
// Deterministic for a given seed. Needs the texture index (index/build-index.mjs).
import { blob, chooseRemovals, decompose, rectPolygon, seededRandom } from '../../lib/geometry.mjs';
import { familyMembers, findTexture } from '../../lib/packs.mjs';
import { COLS, LABEL, ROWS, S, blocksOf, parseGrid } from './grid.mjs';
import { deriveStructure } from './structure.mjs';

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.2;

/** Compounding clutter cuts requested by the user so far (each 0.15 = 15% less than the level before). Append to this to cut again. */
export const CLUTTER_CUTS = [0.15, 0.15];

export function composeScene(html, { seed = 20261031, clutterCuts = CLUTTER_CUTS } = {}) {
  const grid = parseGrid(html);
  const structure = deriveStructure(grid); // the wall squares, doorways and room, interpreted once; floors, walls and wall detail all read it
  const rng = seededRandom(seed);
  const rr = (a, b) => a + (b - a) * rng();
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const W = COLS * S, H = ROWS * S;
  const waterX = (Math.min(...grid.cells(LABEL.WATER).map(([c]) => c)) - 1) * S;

  const objects = [];
  const bigProps = []; // circles clutter keeps away from
  const clutterCircles = [];
  const clutterObjects = []; // the placed ground-clutter entries of `objects`, so the cuts can thin exactly these

  /** Place one object. `scale` is used as given; `px` asks for a size and is clamped into the allowed scale range. */
  function place(tex, x, y, { scale, px, rot = 0, mirror = false, layer = 100 }) {
    if (tex.colorable) { throw new Error(`${tex.name} is a colorable texture: placed untinted it renders raw red`); }
    const s = scale ?? clamp(px / Math.max(tex.w, tex.h), SCALE_MIN, SCALE_MAX);
    if (s < SCALE_MIN - 1e-9 || s > SCALE_MAX + 1e-9) { throw new Error(`Rule 1: ${tex.name} scale ${s.toFixed(3)} is outside ${SCALE_MIN}-${SCALE_MAX}`); }
    objects.push({ pack: tex.pack, rel: tex.rel, name: tex.name, x: +x.toFixed(1), y: +y.toFixed(1), scale: +s.toFixed(3), rot: +rot.toFixed(4), mirror, layer });
    return { x, y, r: (Math.max(tex.w, tex.h) * s) / 2 };
  }
  const T = findTexture;

  // ---------- terrain: water east of the quay, dark dirt under the paving ----------
  const terrain = {
    textures: ['Sea:ch_water:terrain', 'Sea:ch_water_shallow:terrain', 'Seasons:ch_dirtdark_detail:terrain', null].map((s) => (s ? T(s) : null)),
    waterX,
    shallowWidth: S * 1.1,
  };

  // ---------- floors (patterns) ----------
  const patterns = [];
  const pattern = (spec, points, layer) => { const t = T(spec); patterns.push({ pack: t.pack, rel: t.rel, name: t.name, points, layer }); };
  const cellRect = ({ c1, r1, c2, r2 }) => rectPolygon((c1 - 1) * S, (r1 - 1) * S, c2 * S, r2 * S);

  // Pattern layers sit below every object: -400 base paving, -100 the next tier, 100 the top tier (patterns draw under objects
  // on the same layer). Overlapping patterns always sit on different layers, so draw order never depends on file order.
  pattern('Scenes:brick_street_1a:patterns', rectPolygon(0, 0, waterX, H), -400); // all land: street and quay
  // worn street: a dark gravelly dirt blob with broken paving over it, so the dirt shows between the remaining bricks
  const wornStreet = [[150, 1150, 330, 520], [420, 3380, 480, 300], [2900, 3420, 760, 280], [110, 110, 340, 250]];
  for (const [cx, cy, rx, ry] of wornStreet) {
    const outline = blob(rng, cx, cy, rx, ry, { n: 28, jitter: 0.22 }).map(([x, y]) => [clamp(x, 0, waterX - 140), clamp(y, 0, H)]);
    pattern('Elements:rock_to_dirt:patterns', outline, -100);
    pattern('Scenes:brick_street_broken_1a:patterns', outline, 100);
  }
  // stone curb along the quay edge
  pattern('Seasons:Stone_Tiled_Medium:patterns', rectPolygon(waterX - 64, 0, waterX, H), -100);

  // wall mass is masonry underfoot; the room and the doorway squares are plank floor
  for (const rect of decompose(structure.massCells, COLS, ROWS)) { pattern('Buildings:Stone_Sidewalk:patterns', cellRect(rect), -100); }
  for (const rect of decompose(structure.floorCells, COLS, ROWS)) { pattern('Dungeondraft:planks_1b:patterns', cellRect(rect), -100); }
  const { room } = structure;
  for (const [cx, cy, rx, ry] of [[1500, 1800, 230, 150], [2650, 1000, 260, 170], [2300, 2250, 280, 120], [3250, 2000, 180, 210]]) {
    pattern('Dungeondraft:planks_2b:patterns', blob(rng, cx, cy, rx, ry, { n: 24, jitter: 0.22 }), 100); // worn boards
  }

  // ---------- walls (rule 5): ONE thin wall on the outer edge of the wall squares, doorways cut into it ----------
  // The line and its openings come from the structure; the rest of each wall square is wall mass (masonry above, props below).
  const wall = T('Scenes:wall1a:walls');
  const door = T('Buildings:door_wood_14:portals');
  const mkWall = (points, openings, opening) => ({ pack: wall.pack, rel: wall.rel, name: wall.name, thickness: wall.h, loop: true, points, openings: openings.map(([x, y]) => ({ x, y, pack: opening.pack, rel: opening.rel, closed: false })) });
  const walls = [mkWall(structure.wallLine, structure.openings, door)];

  // ---------- wall mass: detail that fills the wall squares behind the single outer wall ----------
  // Shelves and lanterns are drawn with their mounting edge at the top, so rotation 0 faces a north wall; each side turns
  // them a quarter turn. Doors are flanked by stone posts and kept clear.
  /** A point `back` px in from the outer wall edge of band cell `cell`, shifted `along` px along the wall. */
  const onWall = (cell, back, along) => {
    const { out, c, r } = cell;
    const cx = (c - 0.5) * S, cy = (r - 0.5) * S;
    return [cx + out[0] * (S / 2 - back) - out[1] * along, cy + out[1] * (S / 2 - back) + out[0] * along];
  };
  const SHELVES = [['Buildings:Shelf_Wall_Deep:objects', 118], ['Buildings:Shelf_Wall_Small:objects', 64], ['Buildings:Shelf_Wall_Worn:objects', 120], ['Buildings:Shelf_Wall_Worn_Small:objects', 40], ['Buildings:Wall_Shelf_Broken_01:objects', 80]];
  const POSTS = ['Buildings:Pillar_Stone_01:objects', 'Buildings:pillar_stone_05:objects', 'Buildings:pillar_stone_10:objects', 'Buildings:pillar_stone_06:objects'];
  const LAMPS = ['Buildings:Lantern_Wall_01:objects', 'Buildings:Lantern_Wall_02:objects'];
  let wallDetail = 0;
  const post = (x, y, px) => { bigProps.push(place(T(pick(POSTS)), x, y, { px, rot: rr(-0.1, 0.1), layer: 200 })); wallDetail++; };
  let sinceShelf = 0;
  for (const cell of structure.band) {
    if (cell.door) { continue; }
    const { rot } = cell;
    if (cell.corner) {
      const [x, y] = onWall(cell, 128, 0);
      post(x + rr(-14, 14), y + rr(-14, 14), rr(205, 220)); // corner buttress filling the square
      place(T(pick(['Dungeondraft:web_03:objects', 'Dungeondraft:web_06:objects'])), x, y, { scale: rr(0.85, 1), rot: rr(0, 6.28), layer: 300 });
      wallDetail++;
      continue;
    }
    if (cell.nextToDoor) {
      const [x, y] = onWall(cell, 120, 0);
      post(x + rr(-12, 12), y + rr(-12, 12), rr(120, 150)); // door post
      continue;
    }
    sinceShelf++;
    if (sinceShelf >= 2 || rng() < 0.5) {
      sinceShelf = 0;
      const [spec, depth] = pick(SHELVES);
      const tex = T(spec);
      const s = rr(0.85, 1.05);
      const [x, y] = onWall(cell, depth * s / 2 + rr(0, 10), rr(-40, 40));
      bigProps.push({ ...place(tex, x, y, { scale: s, rot: rot + rr(-0.03, 0.03), layer: 200 }), r: depth * s * 0.55 });
      wallDetail++;
      if (rng() < 0.5) {
        const [lx, ly] = onWall(cell, 80 + rr(0, 20), rr(-70, 70));
        place(T(pick(LAMPS)), lx, ly, { scale: rr(0.9, 1.05), rot: rot + rr(-0.06, 0.06), layer: 300 });
        wallDetail++;
      }
    } else {
      const [x, y] = onWall(cell, 100, rr(-30, 30));
      post(x + rr(-8, 8), y + rr(-12, 12), rr(130, 160)); // buttress between shelves
    }
  }

  // ---------- cargo: loose, not perfectly inside squares ----------
  const crateSpecs = ['Buildings:Crate_Large_02:objects', 'Above&Below:crate_03a:objects', 'Buildings:Crate_03:objects', 'Above&Below:cloth_crate_02:objects', 'Buildings:Crate_01:objects', 'Buildings:Crate_Large_01:objects'];
  const midSpecs = ['Buildings:Crate_01:objects', 'Buildings:Crate_Large_02:objects', 'Buildings:Barrel_Simple_Wooden_01:objects', 'Buildings:Barrel_Closed:objects', 'Above&Below:cloth_crate_02:objects', 'Buildings:Crate_03:objects', 'Above&Below:crate_03a:objects'];
  const topSpecs = ['Buildings:Crate_Cloth_Covered_01:objects', 'Buildings:Barrel_Small_Closed:objects', 'Buildings:Sack_Pile_02:objects', 'Buildings:Sack_Tied_Upright_01:objects', 'Above&Below:cloth_crate_01:objects'];
  for (const block of blocksOf(grid, LABEL.LOW)) {
    for (let c = block.c1; c <= block.c2; c++) {
      for (let r = block.r1; r <= block.r2; r++) {
        const cx = (c - 0.5) * S + rr(-34, 34), cy = (r - 0.5) * S + rr(-34, 34);
        bigProps.push(place(T(pick(crateSpecs)), cx, cy, { px: rr(236, 252), rot: rr(-0.2, 0.2), layer: 200 }));
      }
    }
  }
  for (const block of blocksOf(grid, LABEL.TALL)) {
    const cells = [];
    for (let c = block.c1; c <= block.c2; c++) { for (let r = block.r1; r <= block.r2; r++) { cells.push([c, r]); } }
    for (const [c, r] of cells) {
      const cx = (c - 0.5) * S + rr(-28, 28), cy = (r - 0.5) * S + rr(-28, 28);
      bigProps.push(place(T(pick(crateSpecs)), cx, cy, { px: rr(238, 252), rot: rr(-0.14, 0.14), layer: 200 }));
    }
    const shuffled = [...cells].sort(() => rng() - 0.5);
    for (const [c, r] of shuffled.slice(0, Math.max(1, Math.round(cells.length * 0.75)))) {
      place(T(pick(midSpecs)), (c - 0.5) * S + rr(-44, 44), (r - 0.5) * S + rr(-44, 44), { px: rr(176, 214), rot: rr(-0.45, 0.45), layer: 300 });
    }
    for (let i = 0; i < Math.max(1, Math.round(cells.length / 2)); i++) {
      const [c, r] = pick(cells);
      place(T(pick(topSpecs)), (c - 0.5) * S + rr(-50, 50), (r - 0.5) * S + rr(-50, 50), { px: rr(140, 215), rot: rr(-0.5, 0.5), layer: 400 });
    }
  }

  // ---------- the ledger desk ----------
  {
    const [lc, lr] = grid.cells(LABEL.LEDGER)[0];
    const cx = (lc - 0.5) * S + rr(-16, 16), cy = (lr - 0.5) * S + 8 + rr(-8, 8), tilt = rr(-0.05, 0.05);
    bigProps.push({ ...place(T('Buildings:Desk_Writing:objects'), cx, cy, { scale: 0.85, rot: tilt, layer: 200 }), r: 190 });
    place(T('Scenes:book_open_1a:objects'), cx + 8, cy - 4, { scale: 0.8, rot: -0.12 + tilt, layer: 300 });
    place(T('Buildings:Quill_Ink_01:objects'), cx - 104, cy + 10, { scale: 0.85, rot: 0.4, layer: 300 });
    place(T('Interior:lantern_1a:objects'), cx + 116, cy - 8, { scale: 0.9, layer: 300 });
  }

  // ---------- quay: mooring log ends and the dock ladder ----------
  for (const row of [3, 8, 14]) {
    bigProps.push(place(T('Interior:woodlog_end_1a:objects'), waterX - 100 + rr(-8, 8), (row - 0.5) * S + rr(-36, 36), { scale: rr(1.12, 1.2), rot: rr(0, 6.28), layer: 300 }));
  }
  {
    const [, ladderRow] = grid.cells(LABEL.LADDER)[0];
    bigProps.push(place(T('Dungeondraft:ladder_5aa:objects'), waterX - 14 + rr(-8, 8), (ladderRow - 0.5) * S + rr(-12, 12), { scale: 1.15, rot: Math.PI / 2 + rr(-0.05, 0.05), layer: 300 }));
  }

  // ---------- edge dressing: sits mostly past the frame ----------
  for (const [spec, x, y] of [
    ['Buildings:Barrel_Simple_Wooden_01:objects', 30, 50], ['Buildings:Crate_03:objects', 40, 160], ['Buildings:Barrel_Closed:objects', 25, H - 90],
    ['Buildings:Sack_Pile_01:objects', 250, H - 30], ['Buildings:Crate_Large_01:objects', 1600, H - 20], ['Buildings:Barrel_Simple_Wooden_02:objects', 3450, H - 15],
    ['Buildings:Crate_01:objects', 670, 20],
  ]) { bigProps.push(place(T(spec), x + rr(-25, 25), y + rr(-18, 18), { px: rr(226, 250), rot: rr(0, 6.28), layer: 200 })); }

  // ---------- clutter (rule 3): clustered by theme, piled against walls, and sprinkled about ----------
  // ground detail stays small: 30-200 px on its longest side
  const fam = (pack, family) => familyMembers(pack, family).filter((m) => !m.colorable && Math.max(m.w, m.h) >= 30 && Math.max(m.w, m.h) <= 200);
  const THEMES = {
    stones: [fam('Seasons', 'rock_stone'), fam('Seasons', 'rock_dirt'), fam('Death', 'rubble_white'), fam('Buildings', 'debris_stonewall'), fam('Buildings', 'debris_stone_pile')],
    litter: [fam('Buildings', 'paper'), fam('Buildings', 'paper_scatter'), fam('Above&Below', 'gold_coins'), fam('Buildings', 'coin_pouch'), fam('Dungeondraft', 'feather'), fam('Dungeondraft', 'bottle'), fam('Buildings', 'mug'), fam('Buildings', 'cloth_rag_stained')],
    wood: [fam('Buildings', 'debris_wood_pile'), fam('Buildings', 'broken_plank'), fam('Interior', 'rubble_wood'), fam('Buildings', 'broken_crate_small'), fam('Buildings', 'barrel_lid')],
    rope: [fam('Scenes', 'rope_bit'), fam('Above&Below', 'rope'), fam('Buildings', 'chain_broken'), fam('Buildings', 'fish_net'), fam('Dungeondraft', 'hammer')],
    weeds: [fam('Buildings', 'plant_grass_patch'), fam('Dungeondraft', 'grass'), fam('Seasons', 'grass')],
    harbour: [fam('Sea', 'fish'), fam('Sea', 'seashell'), fam('Sea', 'weeds'), fam('Sea', 'leaves'), fam('Interior', 'fish')],
    spill: [fam('Buildings', 'sack_open_spilled'), fam('Seasons', 'hay_stack'), fam('Buildings', 'bucket_water'), fam('Seasons', 'tools_bucket')],
    vermin: [fam('Buildings', 'rat'), fam('Dungeondraft', 'mouse')],
  };
  for (const [name, families] of Object.entries(THEMES)) {
    if (families.some((f) => !f.length)) { throw new Error(`Clutter theme ${name} has an empty texture family`); }
  }
  const OUTDOOR = ['stones', 'stones', 'litter', 'wood', 'wood', 'rope', 'weeds', 'weeds', 'spill', 'vermin'];
  const INDOOR = ['litter', 'litter', 'wood', 'wood', 'rope', 'spill', 'vermin']; // no loose stones or boulders indoors

  const segments = (loop) => loop.map((a, i) => [a, loop[(i + 1) % loop.length]]);
  const wallSegs = segments(structure.wallLine);
  const distToSegment = (x, y, [a, b]) => {
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const t = clamp(((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / len2, 0, 1);
    return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y);
  };
  const outdoorOk = (x, y) => x > 30 && y > 30 && y < H - 30 && x < waterX - 90 && !(x > structure.outerRect.x0 - 20 && x < structure.outerRect.x1 + 20 && y > structure.outerRect.y0 - 20 && y < structure.outerRect.y1 + 20);
  const indoorOk = (x, y) => x > room.x0 + 40 && x < room.x1 - 40 && y > room.y0 + 40 && y < room.y1 - 40;

  function scatterOne(themeName, x, y, ok) {
    const families = THEMES[themeName];
    const tex = pick(pick(families));
    const scale = rr(0.85, 1.15);
    const r = (Math.max(tex.w, tex.h) * scale) / 2 * 0.75;
    if (!ok(x, y)) { return false; }
    if (wallSegs.some((seg) => distToSegment(x, y, seg) < 46 + r * 0.6)) { return false; }
    if (bigProps.some((p) => Math.hypot(p.x - x, p.y - y) < r + p.r * 0.95)) { return false; }
    if (clutterCircles.some((p) => Math.hypot(p.x - x, p.y - y) < 0.55 * (r + p.r))) { return false; }
    place(tex, x, y, { scale, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: 100 });
    clutterObjects.push(objects[objects.length - 1]);
    clutterCircles.push({ x, y, r });
    return true;
  }
  /** A cluster of one theme around a random centre, a few attempts per item. */
  function cluster(themes, bounds, ok, size) {
    const theme = pick(themes);
    if (theme === 'vermin') { size = 1; } // a lone rat, never a swarm
    const cx = rr(bounds.x0, bounds.x1), cy = rr(bounds.y0, bounds.y1);
    const spread = rr(90, 190);
    let placed = 0;
    for (let i = 0; i < size * 6 && placed < size; i++) {
      if (scatterOne(theme, cx + rr(-spread, spread), cy + rr(-spread, spread), ok)) { placed++; }
    }
  }
  /** Debris collects at wall bases: a point just off a wall face, on the room side or the street side. */
  function wallBase(themes, loop, side, ok) {
    const segs = segments(loop);
    const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    let t = rng() * lens.reduce((x, y) => x + y, 0), i = 0;
    while (t > lens[i]) { t -= lens[i]; i++; }
    const [a, b] = segs[i];
    const ux = (b[0] - a[0]) / lens[i], uy = (b[1] - a[1]) / lens[i];
    const off = rr(52, 130) * side; // the loops run clockwise on screen (y down), so (-uy, ux) points inward: side +1 = inside the loop, -1 = outside
    scatterOne(pick(themes), a[0] + ux * t - uy * off, a[1] + uy * t + ux * off, ok);
  }

  // Clutter is placed at the full layout below; the cuts are applied afterwards (see the thinning step).

  // outdoors: dense, especially along the walls and the quay
  const outdoorBounds = { x0: 40, x1: waterX - 100, y0: 40, y1: H - 40 };
  for (let i = 0; i < 20; i++) { cluster(OUTDOOR, outdoorBounds, outdoorOk, 3 + Math.floor(rng() * 4)); }
  for (let i = 0; i < 80; i++) { wallBase(OUTDOOR, structure.wallLine, -1, outdoorOk); }
  for (let i = 0; i < 30; i++) { cluster(OUTDOOR, outdoorBounds, outdoorOk, 1); }
  for (let i = 0; i < 8; i++) { cluster(['harbour'], { x0: waterX - 700, x1: waterX - 100, y0: 40, y1: H - 40 }, outdoorOk, 3); }
  // indoors: lighter than outdoors (ordinary ground detail, not difficult terrain), but never bare
  const roomBounds = { x0: room.x0 + 60, x1: room.x1 - 60, y0: room.y0 + 60, y1: room.y1 - 60 };
  for (let i = 0; i < 8; i++) { cluster(INDOOR, roomBounds, indoorOk, 3 + Math.floor(rng() * 3)); }
  for (let i = 0; i < 32; i++) { wallBase(INDOOR, structure.roomEdge, +1, indoorOk); }
  for (let i = 0; i < 20; i++) { cluster(INDOOR, roomBounds, indoorOk, 1); }

  // Apply the clutter cuts exactly. Scaling the placement attempts instead missed the target (a -15% cut left one map with the
  // same count) because rejected attempts place nothing. Instead remove a seeded share of what was placed: the result is exactly
  // round(placed * density), and a deeper cut always removes a superset of what a shallower cut removed.
  const CLUTTER_DENSITY = clutterCuts.reduce((density, cut) => density * (1 - cut), 1);
  const doomed = chooseRemovals(clutterObjects, CLUTTER_DENSITY, seededRandom((seed ^ 0x9e3779b1) | 0));
  const clutterKept = clutterObjects.length - doomed.size;
  for (let i = objects.length - 1; i >= 0; i--) { if (doomed.has(objects[i])) { objects.splice(i, 1); } }

  // flotsam on the water (passable)
  for (const [spec, x, y, px] of [
    ['Above&Below:plank_a05:objects', waterX + 140, 640, 280], ['Above&Below:plank_b06:objects', waterX + 330, 1900, 470],
    ['Buildings:Broken_Plank_02:objects', waterX + 120, 2500, 260], ['Buildings:Barrel_Lid:objects', waterX + 300, 1250, 150],
    ['Sea:leaves_04:objects', waterX + 420, 3100, 120], ['Buildings:Debris_Wood_Pile_08:objects', waterX + 200, 3380, 100], ['Sea:leaves_02:objects', waterX + 380, 380, 110],
  ]) { place(T(spec), x + rr(-30, 30), y + rr(-30, 30), { px, rot: rr(0, 6.28), layer: 100 }); }

  return { world: { cols: COLS, rows: ROWS, size: S }, terrain, patterns, walls, objects, ring: structure.ring, structure, stats: { clutter: clutterKept, clutterPlaced: clutterObjects.length, wallDetail, objects: objects.length } };
}
