// Composes The Mindmaker's Last Delivery v2 safehouse as plain data (patterns, walls, openings, terrain, paths, objects).
// This is a wholly new map for the v2 edge-wall grid: every texture was chosen again from contact sheets, and nothing is carried over
// from the earlier safehouse. The look is a timber-and-plaster lodging house: dark boards and a ransacked parlour in the common
// room, a herringbone-floored records room, a cold slab-floored storeroom, a hall corridor to the south and a cobbled street east.
//
// Follows the user's mapping rules (see the dungeondraft skill):
//  1 object scale stays within 0.8-1.2        2 no object shadows (the writer turns them off)
//  3 small ground clutter, denser on difficult terrain, at the standing calibration (CLUTTER_CUTS)
//  4 props sit loosely, rotated and off square centres
//  5 walls are lines on grid lines; the squares themselves are walkable floor, dressed lightly and flush
//  6 buildings from walls + patterns + terrain, no cave/building tool
//  7 no elevation changes on this map
// Deterministic for a given seed. Needs the texture index (index/build-index.mjs).
import { blob, chooseRemovals, distToSegment, pointInPolygon, rectPolygon, seededRandom } from '../../lib/geometry.mjs';
import { findTexture } from '../../lib/packs.mjs';
import { CLUTTER_CUTS, SCALE_MAX, SCALE_MIN, applyClutterCuts, assertThemes, buildObject, circleShadows, makeFam, orderWalls, pathRecord, patternRecord, randomHelpers, shadowPathRecord, wallRecord } from '../../lib/scene-kit.mjs';
import { SHADOW_LAYER, SHADOW_PATH_LAYER } from '../../lib/shadows.mjs';
import { BASE_COLS, COLS, LABEL, ROWS, S, blocksOf, parseGrid } from './grid.mjs';
import { deriveStructure } from './structure.mjs';

export { CLUTTER_CUTS, SCALE_MAX, SCALE_MIN };

/** Object layers. Patterns sit at -400 and -100 (and 100 for street dirt); shadow paths at 400; wall lamps above the walls. */
export const LAYER = { seam: 100, rug: -100, shadow: SHADOW_LAYER, clutter: 100, furniture: 200, onTop: 300, shadowPath: SHADOW_PATH_LAYER, lamp: 700 };

/** Wall and portal textures, by whether the wall is the building's outside or a partition. */
export const WALL_TEXTURE = { outer: 'Scenes:wall1a:walls', inner: 'Interior:wood2a:walls' };
/** Every doorway is the invisible portal: it cuts the gap in the wall and draws nothing, so doors, frames or posts can be placed by hand. */
export const DOOR_TEXTURE = 'Interior:empty:portals';

/** Floors (patterns). */
export const FLOOR = {
  common: 'Interior:wood_1a:patterns',
  records: 'Interior:wood_4a:patterns',
  store: 'Seasons:Stone_Tiled_Dark:patterns',
  corridor: 'Dungeondraft:planks_1a:patterns',
  street: 'Interior:cobbles_1c:patterns',
  sidewalk: 'Buildings:Stone_Sidewalk:patterns',
  dirt: 'Buildings:Stones_Cellar:patterns',
};

/** The thin line path laid across a doorway where one room's floor pattern meets the next (the seam would otherwise show raw). */
export const SEAM_LINE = 'Buildings:line:paths';

/** Shadow strengths: tight contact shade on the floor side of every wall, a wider fall onto the street. */
export const SHADE_INSIDE = { edge: 'half', size: 'small', strength: '050' };
export const SHADE_STREET = { edge: 'half', size: 'large', strength: '050' };

/**
 * Stone and brick rubble (stone piles, loose rocks, white rubble, broken wall): this map keeps only this share of what the layout
 * placed, on top of the standing clutter calibration. The user asked for about half of it gone, on this map only.
 */
export const RUBBLE_KEEP = 0.5;
/**
 * Ground clutter on this map, as the share kept of what the standing calibration leaves: ordinary floor keeps a tenth, and difficult
 * terrain (the paper and belongings squares and the spill around the low furniture) keeps 0.7, exactly as before, so those squares
 * still read as noticeably thicker than the floor around them. Asked for by the user on this map only.
 */
export const GROUND_KEEP = { ordinary: 0.1, difficult: 0.7 };
export const RUBBLE_NAME = /^(debris_stone|rock_stone|rubble)/i;

/** Half the wall thickness, so dressing can sit flush against a face instead of under the wall. */
const halfThickness = (outer) => findTexture(outer ? WALL_TEXTURE.outer : WALL_TEXTURE.inner).h / 2;

export function composeScene(html, { seed = 20261031, clutterCuts = CLUTTER_CUTS, rubbleKeep = RUBBLE_KEEP, groundKeep = GROUND_KEEP, deployment = [] } = {}) {
  const grid = parseGrid(html, deployment);
  const structure = deriveStructure(grid);
  const rng = seededRandom(seed);
  const { rr, pick } = randomHelpers(rng);
  const W = COLS * S, H = ROWS * S;
  const T = findTexture;

  const objects = [];
  const bigProps = []; // circles that clutter and wall dressing keep away from: { x, y, r }
  const clutterCircles = [];
  const clutterObjects = []; // the placed ground-clutter entries of `objects`, so the cuts can thin exactly these
  const casters = []; // the biggest props, which get a circular shadow underneath: { x, y, size, strength }
  const centre = (c, r) => [(c - 0.5) * S, (r - 0.5) * S];

  /** Place one object. `scale` is used as given; `px` asks for a size and is clamped into the allowed scale range. */
  function place(spec, x, y, { scale, px, rot = 0, mirror = false, layer = LAYER.furniture, big = false }) {
    const tex = typeof spec === 'string' ? T(spec) : spec;
    const { object, radius } = buildObject(tex, x, y, { scale, px, rot, mirror, layer });
    objects.push(object);
    const record = { x, y, r: radius * 0.9 };
    if (big) { bigProps.push(record); }
    return record;
  }

  // ---------- terrain: dark mud under everything, a stony band in the street ----------
  const terrain = { textures: ['Seasons:ch_dirtdark_base:terrain', 'Seasons:ch_dirtdark_to_stone:terrain', null, null].map((s) => (s ? T(s) : null)) };
  {
    const TW = COLS * 4, TH = ROWS * 4;
    const splat = new Array(TW * TH * 4).fill(0);
    for (let ty = 0; ty < TH; ty++) {
      for (let tx = 0; tx < TW; tx++) {
        const o = (ty * TW + tx) * 4;
        const street = (tx + 0.5) * 64 >= BASE_COLS * S;
        splat[o + (street ? 1 : 0)] = 255;
      }
    }
    terrain.splat = splat;
  }

  // ---------- floors (patterns) ----------
  // -400 is the street under everything, -100 the room floors and the pavement (never overlapping each other), 100 the street dirt.
  const patterns = [];
  const pattern = (spec, points, layer) => { patterns.push(patternRecord(T(spec), points, layer)); };
  const cellRect = ({ c1, r1, c2, r2 }) => rectPolygon((c1 - 1) * S, (r1 - 1) * S, c2 * S, r2 * S);
  for (const rect of structure.floors.street) { pattern(FLOOR.street, cellRect(rect), -400); }
  for (const name of ['common', 'records', 'store', 'corridor']) {
    for (const rect of structure.floors[name]) { pattern(FLOOR[name], cellRect(rect), -100); }
  }
  pattern(FLOOR.sidewalk, rectPolygon(BASE_COLS * S, 0, BASE_COLS * S + 176, H), -100);
  // patched paving where cart traffic has worn the cobbles through, kept off the carriage (its shadow circle sits on a lower layer)
  for (const [cx, cy, rx, ry] of [[4770, 2000, 150, 270], [4650, 3470, 160, 210]]) {
    pattern(FLOOR.dirt, blob(rng, cx, cy, rx, ry, { n: 30, jitter: 0.24 }), 100);
  }

  // ---------- walls (rule 5): lines on grid lines, doorways cut into them ----------
  // A wall draws over every wall before it, so the building's outline goes last and a partition that runs into another wall goes
  // before it: nothing shows over the walls it joins.
  const outerOf = new Map();
  const walls = orderWalls(structure.walls.map((w) => {
    const record = wallRecord(T(WALL_TEXTURE[w.outer ? 'outer' : 'inner']), { loop: false, points: w.points, openings: w.openings }, T(DOOR_TEXTURE));
    outerOf.set(record, w.outer);
    return record;
  }), (record) => (outerOf.get(record) ? 1 : 0));
  const wallSegs = structure.lines.map((l) => l.points);

  // ---------- keep-out helpers ----------
  const inArea = (name, margin = 70) => (x, y) => {
    if (structure.areaOf(Math.floor(x / S) + 1, Math.floor(y / S) + 1) !== name) { return false; }
    return !wallSegs.some((seg) => distToSegment(x, y, seg) < margin);
  };

  // ======================================================================================================================
  // RECORDS ROOM (columns 1-10, rows 1-8): torn-open document cupboards, a ransacked desk, spilled chests, Grappa's trolley
  // ======================================================================================================================
  const NORTH_FACE = halfThickness(true) + 6; // outer wall half thickness plus a little air
  {
    // tall document cupboards along the north wall at (2-4,1): one 3-square case, drawers dragged out in front of it
    const cx = 640 + rr(-14, 14), cy = NORTH_FACE + 114 + rr(0, 8);
    place('Foundation:cabinet3a:objects', cx, cy, { scale: 0.84, rot: rr(-0.012, 0.012), big: true });
    casters.push({ x: cx, y: cy, size: 771, strength: '050' });
    place('Buildings:Paper_Scatter_01:objects', cx - 190 + rr(-20, 20), cy + rr(-14, 14), { scale: 1, rot: rr(0, 6.28), layer: LAYER.onTop });
    place('Interior:book_open_1a:objects', cx + 170 + rr(-20, 20), cy + rr(-14, 14), { scale: 0.85, rot: rr(-0.4, 0.4), layer: LAYER.onTop });
    place('Buildings:Scroll_Opened:objects', cx + rr(-30, 30), cy + rr(-10, 10), { scale: 0.8, rot: rr(1.2, 1.9), layer: LAYER.onTop });
    place('Buildings:Drawer_01:objects', 500 + rr(-20, 20), 385 + rr(-14, 14), { scale: 0.82, rot: 0.35 + rr(-0.1, 0.1) });
    place('Buildings:Drawer_02:objects', 880 + rr(-20, 20), 360 + rr(-14, 14), { scale: 0.8, rot: 3.5 + rr(-0.2, 0.2) });
    // and the tall cupboard along the west wall at (1,4-5), its back to the wall
    const wx = NORTH_FACE + 106 + rr(0, 6), wy = 1024 + rr(-12, 12);
    place('Dungeondraft:cabinet_13a:objects', wx, wy, { scale: 0.94, rot: -Math.PI / 2 + rr(-0.012, 0.012), big: true });
    casters.push({ x: wx, y: wy, size: 513, strength: '050' });
    // a worn rug under the open floor of the north-west
    place('Interior:rug_1a:objects', 575 + rr(-10, 10), 770 + rr(-10, 10), { scale: 1.1, rot: 0.06 + rr(-0.03, 0.03), layer: LAYER.rug });

    // the desk, the low document chests and fallen drawers at (4-5,5-6)
    const dx = 1010 + rr(-16, 16), dy = 1175 + rr(-12, 12), tilt = 0.1 + rr(-0.04, 0.04);
    place('Dungeondraft:desk_3a:objects', dx, dy, { scale: 0.85, rot: tilt, big: true });
    casters.push({ x: dx, y: dy, size: 470, strength: '050' });
    place('Interior:chair_4a:objects', dx + 38 + rr(-10, 10), dy + 215 + rr(-8, 8), { scale: 1, rot: 2.65 + rr(-0.15, 0.15), big: true });
    place('Buildings:Chair_Basic_Laying_01:objects', 1215 + rr(-12, 12), 1115 + rr(-12, 12), { scale: 0.95, rot: 1.2 + rr(-0.2, 0.2), big: true });
    place('Buildings:Chest_Open_Contents_Documents:objects', 850 + rr(-14, 14), 1400 + rr(-10, 10), { scale: 1, rot: -0.3 + rr(-0.15, 0.15), big: true });
    place('Buildings:Paper_Scatter_01:objects', dx - 40, dy - 6, { scale: 0.95, rot: rr(0, 6.28), layer: LAYER.onTop });
    place('Interior:book_open_1a:objects', dx + 90, dy + 8, { scale: 0.85, rot: -0.2 + tilt, layer: LAYER.onTop });
    place('Buildings:Quill_Ink_01:objects', dx - 150, dy + 28, { scale: 0.85, rot: 0.5, layer: LAYER.onTop });

    // the toppled cupboard and spilled chests at (8-9,2-3)
    const bx = 2040 + rr(-16, 16), by = 500 + rr(-14, 14);
    place('Dungeondraft:broken_cabinet_1a:objects', bx, by, { scale: 0.93, rot: 0.2 + rr(-0.05, 0.05), big: true });
    casters.push({ x: bx, y: by, size: 497, strength: '050' });
    place('Buildings:Chest_Open_Base_01:objects', 1880 + rr(-12, 12), 650 + rr(-10, 10), { scale: 0.8, rot: 0.55 + rr(-0.15, 0.15), big: true });
    place('Buildings:Chest_Open_Contents_Documents:objects', 2200 + rr(-10, 10), 330 + rr(-10, 10), { scale: 0.95, rot: -0.5 + rr(-0.15, 0.15), big: true });

    // Grappa's luggage trolley at his square, long axis east-west
    const [gx, gy] = centre(grid.ally.x, grid.ally.y);
    const tx = gx + rr(-10, 10), ty = gy + rr(-8, 8);
    place('Tomb & Anvil:foodcart_1a:objects', tx, ty, { scale: 0.85, rot: Math.PI / 2 + 0.12 + rr(-0.05, 0.05), big: true });
    place('Scenes:suitcase_s_1a:objects', tx + 90, ty + 6, { scale: 0.82, rot: 1.55 + rr(-0.1, 0.1), layer: LAYER.onTop });
  }

  // ======================================================================================================================
  // STOREROOM (columns 11-16, rows 1-8): tall stacks, low crates, spilled belongings, the rear doors
  // ======================================================================================================================
  {
    const CRATES = ['Interior:crate_4a:objects', 'Interior:crate_5a:objects', 'Interior:crate_5d:objects', 'Interior:crate_3a:objects', 'Interior:crate_4c:objects'];
    // the tall stack at (12-13,2-3): four crates, a second tier and loose top pieces
    for (const block of blocksOf(grid, LABEL.TALL).filter((b) => b.c1 >= 11)) {
      const cells = [];
      for (let c = block.c1; c <= block.c2; c++) { for (let r = block.r1; r <= block.r2; r++) { cells.push([c, r]); } }
      for (const [c, r] of cells) {
        const [x, y] = centre(c, r);
        place(pick(CRATES), x + rr(-30, 30), y + rr(-30, 30), { px: rr(236, 254), rot: rr(-0.14, 0.14), big: true });
      }
      const bx = ((block.c1 + block.c2 - 1) / 2) * S, by = ((block.r1 + block.r2 - 1) / 2) * S;
      casters.push({ x: bx, y: by, size: (block.c2 - block.c1 + 1) * S, strength: '075' });
      for (const [c, r] of [...cells].sort(() => rng() - 0.5).slice(0, 3)) {
        const [x, y] = centre(c, r);
        place(pick(['Modular:package_5a:objects', 'Interior:crate_3c:objects', 'Interior:barrel_0a:objects', 'Modular:package_6a:objects']), x + rr(-40, 40), y + rr(-40, 40), { px: rr(170, 210), rot: rr(-0.5, 0.5), layer: LAYER.onTop });
      }
      place(pick(['Modular:package_1a:objects', 'Interior:sack_3a:objects']), bx + rr(-60, 60), by + rr(-60, 60), { px: rr(150, 190), rot: rr(-0.6, 0.6), layer: LAYER.onTop });
    }
    // the low crates at (11-12,6-7): a single tier, one of them smashed open
    for (const block of blocksOf(grid, LABEL.LOW).filter((b) => b.c1 >= 11 && b.r1 <= 8)) {
      let n = 0;
      for (let c = block.c1; c <= block.c2; c++) {
        for (let r = block.r1; r <= block.r2; r++) {
          const [x, y] = centre(c, r);
          const spec = n++ === 2 ? 'Interior:crate_broken_5a:objects' : pick(CRATES.slice(0, 4));
          place(spec, x + rr(-34, 34), y + rr(-34, 34), { px: rr(210, 246), rot: rr(-0.2, 0.2), big: true });
        }
      }
    }
    place('Scenes:suitcase_open_1a:objects', 3470 + rr(-30, 30), 1450 + rr(-24, 24), { scale: 0.85, rot: 0.9 + rr(-0.3, 0.3), layer: LAYER.furniture, big: true });
    place('Interior:barrel_0a:objects', 4005 + rr(-10, 10), 1960 + rr(-10, 10), { scale: 1, rot: rr(0, 6.28), big: true });
    place('Interior:sack_3a:objects', 3880 + rr(-14, 14), 1985 + rr(-8, 8), { scale: 0.9, rot: rr(-0.5, 0.5), big: true });
    place('Interior:carpet_woven_1a:objects', 3350 + rr(-14, 14), 1190 + rr(-14, 14), { scale: 0.8, rot: 0.08 + rr(-0.03, 0.03), layer: LAYER.rug });
  }

  // ======================================================================================================================
  // COMMON ROOM (columns 1-16, rows 9-14): the parlour, the packing cases, the luggage, the bedding
  // ======================================================================================================================
  {
    // the seating group at (3-4,10-11): sofa, two armchairs and a low table on a round rug, one chair knocked askew
    const gx = 768 + rr(-10, 10), gy = 2560 + rr(-10, 10);
    place('Interior:rug_3a:objects', gx, gy, { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.rug });
    place('Modular:sofa_l_1a:objects', gx + rr(-8, 8), gy - 190 + rr(-8, 8), { scale: 0.85, rot: rr(-0.05, 0.05), big: true });
    place('Modular:sofa_1a:objects', gx - 178 + rr(-8, 8), gy + 30 + rr(-8, 8), { scale: 0.85, rot: -Math.PI / 2 + 0.38, big: true });
    place('Scenes:couch_single_1a:objects', gx + 182 + rr(-8, 8), gy + 20 + rr(-8, 8), { scale: 0.85, rot: Math.PI / 2 - 0.06, big: true });
    place('Buildings:Endtable_Round:objects', gx + 14, gy + 40, { scale: 1.1, rot: rr(0, 6.28), layer: LAYER.furniture, big: true });
    place('Buildings:Pillow_Broken_01:objects', gx - 60, gy + 110, { scale: 1, rot: rr(0, 6.28), layer: LAYER.onTop });

    // the tall packing cases at (7-8,11): two big cases with a smaller one and a strapped parcel on top
    for (const block of blocksOf(grid, LABEL.TALL).filter((b) => b.r1 >= 9)) {
      const cells = [];
      for (let c = block.c1; c <= block.c2; c++) { for (let r = block.r1; r <= block.r2; r++) { cells.push([c, r]); } }
      for (const [c, r] of cells) {
        const [x, y] = centre(c, r);
        place(pick(['Interior:crate_5a:objects', 'Interior:crate_4a:objects']), x + rr(-26, 26), y + rr(-26, 26), { px: rr(240, 254), rot: rr(-0.12, 0.12), big: true });
      }
      const bx = ((block.c1 + block.c2 - 1) / 2) * S, by = ((block.r1 + block.r2 - 1) / 2) * S;
      casters.push({ x: bx, y: by, size: (block.c2 - block.c1 + 1) * S, strength: '075' });
      place('Interior:crate_3a:objects', bx - 60 + rr(-20, 20), by + rr(-24, 24), { px: 196, rot: rr(0.3, 0.7), layer: LAYER.onTop });
      place('Modular:package_6a:objects', bx + 80 + rr(-20, 20), by + rr(-24, 24), { px: 200, rot: rr(-0.5, -0.2), layer: LAYER.onTop });
    }

    // the low luggage at (11-12,11-12): strewn bedding with cases on and around it
    for (const block of blocksOf(grid, LABEL.LOW).filter((b) => b.c1 === 11 && b.r1 >= 9)) {
      const [x0, y0] = centre(block.c1, block.r1);
      place('Buildings:Blanket_Messy_01:objects', x0 + 140 + rr(-14, 14), y0 + 150 + rr(-14, 14), { scale: 0.9, rot: rr(0, 6.28), layer: LAYER.furniture, big: true });
      const cases = ['Scenes:suitcase_1a:objects', 'Scenes:suitcase_2a:objects', 'Scenes:suitcase_s_1a:objects', 'Scenes:bag_1a:objects'];
      let n = 0;
      for (let c = block.c1; c <= block.c2; c++) {
        for (let r = block.r1; r <= block.r2; r++) {
          const [x, y] = centre(c, r);
          place(cases[n++ % cases.length], x + rr(-36, 36), y + rr(-36, 36), { scale: rr(0.88, 1.05), rot: rr(0, 6.28), layer: LAYER.onTop, big: true });
        }
      }
    }
    // the second heap at (15-16,11-12): a stripped mattress with strapped bags and parcels
    for (const block of blocksOf(grid, LABEL.LOW).filter((b) => b.c1 === 15)) {
      const mx = ((block.c1 + block.c2 - 1) / 2) * S + 10, my = ((block.r1 + block.r2 - 1) / 2) * S + 4;
      place('Buildings:Blanket_Double_Messy_02:objects', mx + rr(-12, 12), my + rr(-12, 12), { scale: 0.92, rot: 0.15 + rr(-0.06, 0.06), layer: LAYER.furniture, big: true });
      place('Buildings:Pillow_Broken_02:objects', mx - 130, my - 50, { scale: 1, rot: rr(0, 6.28), layer: LAYER.onTop });
      for (const [dx, dy, spec] of [[-90, 90, 'Modular:package_4a:objects'], [120, -80, 'Modular:package_1a:objects'], [100, 100, 'Scenes:bag_1a:objects'], [-60, -110, 'Modular:satchel_strap_1a:objects']]) {
        place(spec, mx + dx + rr(-24, 24), my + dy + rr(-24, 24), { scale: rr(0.9, 1.1), rot: rr(0, 6.28), layer: LAYER.onTop, big: true });
      }
    }
    // a good rug where the party comes in, and a runner along the east end
    place('Interior:rug_8a:objects', 2170 + rr(-14, 14), 3180 + rr(-14, 14), { scale: 0.85, rot: rr(0, 6.28), layer: LAYER.rug });
  }

  // ======================================================================================================================
  // CORRIDOR (rows 15-16): the hall that carries on west beyond the map
  // ======================================================================================================================
  {
    place('Scenes:carpet_1a:objects', 905 + rr(-14, 14), 3840 + rr(-8, 8), { scale: 0.92, rot: rr(-0.02, 0.02), layer: LAYER.rug });
    place('Scenes:carpet_1a:objects', 3300 + rr(-14, 14), 3840 + rr(-8, 8), { scale: 0.92, rot: rr(-0.02, 0.02), mirror: true, layer: LAYER.rug });
    place('Interior:bench_1a:objects', 780 + rr(-20, 20), 4096 - NORTH_FACE - 72, { scale: 0.9, rot: Math.PI + rr(-0.03, 0.03), big: true });
    place('Interior:chest_2a:objects', 3780 + rr(-14, 14), 4096 - NORTH_FACE - 100 + rr(-6, 6), { scale: 0.9, rot: Math.PI + rr(-0.1, 0.1), big: true });
    place('Modular:shoe_1a:objects', 3340 + rr(-20, 20), 3990 + rr(-10, 10), { scale: 1, rot: 1.2 + rr(-0.3, 0.3), layer: LAYER.clutter });
    place('Modular:shoe_2a:objects', 3395 + rr(-20, 20), 3978 + rr(-10, 10), { scale: 1, rot: 1.9 + rr(-0.3, 0.3), layer: LAYER.clutter });
  }

  // ======================================================================================================================
  // STREET (columns 17-20): the carriage, street lamps on the wall, barrels and crates at the kerb
  // ======================================================================================================================
  {
    const cx = 4096 + 2.45 * S + rr(-12, 12), cy = 3.0 * S + rr(-12, 12);
    place('Tomb & Anvil:caravan_3a:objects', cx, cy, { scale: 0.8, rot: 0.03 + rr(-0.02, 0.02), big: true });
    casters.push({ x: cx, y: cy, size: 686, strength: '075' });
    for (const row of [1.9, 4.1, 7.6]) { // lanterns on the street face of the wall, flanking the rear doors
      place(pick(['Buildings:Lantern_Wall_01:objects', 'Buildings:Lantern_Wall_02:objects']), 4096 + halfThickness(true) + 69, row * S + rr(-8, 8), { scale: rr(0.9, 1), rot: structure.wallRotation([1, 0]) + rr(-0.04, 0.04), layer: LAYER.lamp });
    }
    place('Buildings:Barrel_Open_Water:objects', 4390 + rr(-12, 12), 1850 + rr(-12, 12), { scale: 0.95, rot: rr(0, 6.28), big: true });
    place('Interior:barrel_0a:objects', 4470 + rr(-12, 12), 1930 + rr(-12, 12), { scale: 1.05, rot: rr(0, 6.28), big: true });
    place('Interior:crate_2a:objects', 4900 + rr(-14, 14), 2260 + rr(-14, 14), { scale: 1, rot: rr(-0.4, 0.4), big: true });
    place('Interior:crate_broken_3a:objects', 4980 + rr(-14, 14), 2480 + rr(-14, 14), { scale: 1, rot: rr(0, 6.28), big: true });
    place('Modular:grate_1a:objects', 4750 + rr(-14, 14), 3000 + rr(-14, 14), { scale: 1, rot: 0.1 + rr(-0.05, 0.05), layer: LAYER.clutter });
    place('Buildings:Barrel_Broken_Side_01:objects', 4600 + rr(-14, 14), 3650 + rr(-14, 14), { scale: 0.9, rot: rr(0, 6.28), big: true });
  }

  // ---------- wall dressing: lanterns at the doorways, shallow shelves, corner cobwebs ----------
  // Dressing hangs flush on a wall face: lamps and shelves are drawn mounting-edge up, so `wallRotation` turns each to its wall.
  const LAMPS = ['Buildings:Lantern_Wall_01:objects', 'Buildings:Lantern_Wall_02:objects'];
  const SHELVES = [['Buildings:Shelf_Wall_Small:objects', 120], ['Buildings:Shelf_Wall_Worn_Small:objects', 74], ['Buildings:Wall_Shelf_Broken_01:objects', 80]];
  let wallDetail = 0;
  /** Wall space already taken on each face, as [from, to] along the line: lamps and shelves now, bookcases and pictures later. */
  const dressed = [];
  const faceKey = (line, side) => `${line.id}:${side.n.join(',')}`;
  const doorEnds = new Set();
  for (const line of structure.lines) {
    for (const [x, y] of line.openings) {
      const m = line.horizontal ? x : y;
      doorEnds.add(`${line.id}:${m - S / 2}`);
      doorEnds.add(`${line.id}:${m + S / 2}`);
    }
  }
  for (const line of structure.lines) {
    const half = halfThickness(line.outer);
    for (const stretch of line.stretches) {
      const length = stretch.to - stretch.from;
      for (const side of stretch.sides) {
        if (!side.area || side.area === 'street') { continue; }
        const rot = structure.wallRotation(side.n);
        // a lantern on each end of the stretch that touches a doorway, and every so often along the corridor
        const lampAt = [];
        if (doorEnds.has(`${line.id}:${stretch.from}`)) { lampAt.push(46); }
        if (doorEnds.has(`${line.id}:${stretch.to}`)) { lampAt.push(length - 46); }
        if (side.area === 'corridor') { for (let t = 330; t < length - 330; t += 700) { lampAt.push(t); } }
        for (const t of lampAt) {
          const [x, y] = structure.faceSpot(stretch, side.n, t, half + 67 + 2);
          place(pick(LAMPS), x, y, { scale: rr(0.88, 1.0), rot: rot + rr(-0.04, 0.04), layer: LAYER.lamp });
          dressed.push({ key: faceKey(line, side), lo: stretch.from + t - 70, hi: stretch.from + t + 70 });
          wallDetail++;
        }
        // shelves on some of the squares along the face, never in front of a doorway or among the furniture
        for (let t = S / 2; t < length; t += S) {
          if (rng() > 0.4 || t < 150 || t > length - 150) { continue; }
          const [spec, depth] = pick(SHELVES);
          const s = rr(0.88, 1.05);
          const at = t + rr(-40, 40);
          const [x, y] = structure.faceSpot(stretch, side.n, at, half + (depth * s) / 2 + rr(0, 4));
          if (bigProps.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 90)) { continue; }
          place(spec, x, y, { scale: s, rot: rot + rr(-0.03, 0.03), layer: LAYER.onTop });
          dressed.push({ key: faceKey(line, side), lo: stretch.from + at - (T(spec).w * s) / 2, hi: stretch.from + at + (T(spec).w * s) / 2 });
          wallDetail++;
        }
      }
    }
  }
  // cobwebs tucked into the room corners that are real corners: north-west of the records room and north-east of the storeroom
  for (const [x, y] of [[halfThickness(true) + 62, halfThickness(true) + 62], [4096 - halfThickness(true) - 62, halfThickness(true) + 62], [2560 + halfThickness(false) + 60, halfThickness(true) + 60]]) {
    place(pick(['Dungeondraft:web_03:objects', 'Dungeondraft:web_06:objects']), x + rr(-8, 8), y + rr(-8, 8), { scale: rr(0.85, 1), rot: rr(0, 6.28), layer: LAYER.onTop });
    wallDetail++;
  }

  // ---------- clutter (rule 3): themed clusters, piles against walls, singles; difficult squares get noticeably more ----------
  const fam = makeFam(200);
  const THEMES = {
    papers: [fam('Interior', 'paper'), fam('Dungeondraft', 'paper'), fam('Buildings', 'paper'), fam('Modular', 'paper'), fam('Scenes', 'letter'), fam('Interior', 'book_slanted'), fam('Interior', 'book_side'), fam('Scenes', 'book'), fam('Dungeondraft', 'books_side'), fam('Buildings', 'notebook')],
    belongings: [fam('Modular', 'clothes_pile'), fam('Scenes', 'clothes_pile'), fam('Buildings', 'cloth_rag_stained'), fam('Scenes', 'hat'), fam('Scenes', 'tophat'), fam('Modular', 'shoe'), fam('Buildings', 'pillow_broken'), fam('Dungeondraft', 'hat'), fam('Modular', 'feather')],
    crockery: [fam('Dungeondraft', 'broken_glass'), fam('Interior', 'plate'), fam('Interior', 'mug'), fam('Interior', 'teapot'), fam('Modular', 'jug'), fam('Buildings', 'soup_spill')],
    wood: [fam('Buildings', 'debris_wood_pile'), fam('Buildings', 'broken_plank'), fam('Buildings', 'broken_crate_small'), fam('Buildings', 'barrel_lid')],
    stock: [fam('Buildings', 'sack_open_spilled'), fam('Seasons', 'hay_stack'), fam('Scenes', 'rope_bit'), fam('Modular', 'package'), fam('Buildings', 'coin_pouch')],
    street: [fam('Seasons', 'rock_stone'), fam('Buildings', 'debris_stone_pile'), fam('Buildings', 'debris_stonewall'), fam('Death', 'rubble_white'), fam('Buildings', 'plant_grass_patch'), fam('Buildings', 'broken_plank'), fam('Seasons', 'hay_stack')],
  };
  assertThemes(THEMES);

  /** Place one ground-clutter piece when it is inside `ok`, off the walls and clear of props and other clutter. */
  function scatterOne(themeName, x, y, ok) {
    const tex = pick(pick(THEMES[themeName]));
    const scale = rr(0.85, 1.15);
    const r = (Math.max(tex.w, tex.h) * scale) / 2 * 0.75;
    if (!ok(x, y)) { return false; }
    if (wallSegs.some((seg) => distToSegment(x, y, seg) < 50 + r * 0.6)) { return false; }
    if (bigProps.some((p) => Math.hypot(p.x - x, p.y - y) < r + p.r * 0.95)) { return false; }
    if (clutterCircles.some((p) => Math.hypot(p.x - x, p.y - y) < 0.55 * (r + p.r))) { return false; }
    place(tex, x, y, { scale, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.clutter });
    clutterObjects.push(objects[objects.length - 1]);
    clutterCircles.push({ x, y, r });
    return true;
  }
  /** A cluster of one theme around (cx, cy): a few attempts per piece. */
  function cluster(theme, cx, cy, size, spread, ok) {
    let placed = 0;
    for (let i = 0; i < size * 7 && placed < size; i++) {
      if (scatterOne(theme, cx + rr(-spread, spread), cy + rr(-spread, spread), ok)) { placed++; }
    }
  }
  const roomBox = (c1, r1, c2, r2) => ({ x0: (c1 - 1) * S + 90, x1: c2 * S - 90, y0: (r1 - 1) * S + 90, y1: r2 * S - 90 });
  const scatterRoom = (area, box, themes, groups, singles) => {
    const ok = inArea(area);
    for (let i = 0; i < groups; i++) { cluster(pick(themes), rr(box.x0, box.x1), rr(box.y0, box.y1), 3 + Math.floor(rng() * 3), rr(90, 180), ok); }
    for (let i = 0; i < singles; i++) { cluster(pick(themes), rr(box.x0, box.x1), rr(box.y0, box.y1), 1, 0, ok); }
  };

  // ordinary ground detail: lighter than on difficult terrain
  scatterRoom('records', roomBox(1, 1, 10, 8), ['papers', 'papers', 'papers', 'crockery', 'wood'], 9, 14);
  scatterRoom('store', roomBox(11, 1, 16, 8), ['stock', 'stock', 'wood', 'papers'], 5, 9);
  scatterRoom('common', roomBox(1, 9, 16, 14), ['belongings', 'belongings', 'crockery', 'papers', 'wood'], 10, 18);
  scatterRoom('corridor', roomBox(1, 15, 16, 16), ['belongings', 'papers', 'wood'], 3, 7);
  scatterRoom('street', roomBox(17, 1, 20, 16), ['street', 'street', 'wood', 'stock'], 12, 16);

  // difficult terrain: papers and belongings piled noticeably thicker than the ground detail around them
  const firstDifficult = clutterObjects.length; // everything placed from here on is difficult-terrain clutter
  for (const [c, r] of grid.cells(LABEL.PAPERS)) {
    const [x, y] = centre(c, r);
    const area = structure.areaOf(c, r);
    const theme = area === 'records' ? 'papers' : 'belongings';
    cluster(theme, x + rr(-10, 10), y + rr(-10, 10), 8, 105, inArea(area, 40));
    if (area !== 'records') { cluster('crockery', x, y, 2, 100, inArea(area, 40)); }
  }
  for (const block of blocksOf(grid, LABEL.LOW)) {
    // spilled bits around the edge of every low furniture / crate block
    const [x0, y0] = centre(block.c1, block.r1), [x1, y1] = centre(block.c2, block.r2);
    const area = structure.areaOf(block.c1, block.r1);
    const theme = area === 'records' ? 'papers' : area === 'store' ? 'stock' : 'belongings';
    cluster(theme, (x0 + x1) / 2, (y0 + y1) / 2, 5, 330, inArea(area, 40));
  }
  const difficultClutter = new Set(clutterObjects.slice(firstDifficult));

  // Apply the clutter cuts exactly: a seeded share of what was placed is removed (see applyClutterCuts in lib/scene-kit.mjs).
  let clutterKept = applyClutterCuts(objects, clutterObjects, seed, clutterCuts);
  // then thin the ground clutter for this map, ordinary ground and difficult terrain on a seeded stream each, so no prop moves
  const alive = clutterObjects.filter((o) => objects.includes(o));
  const groundBefore = alive.length;
  const ordinaryAlive = alive.filter((o) => !difficultClutter.has(o)).length;
  const groundDoomed = new Set([
    ...chooseRemovals(alive.filter((o) => !difficultClutter.has(o)), groundKeep.ordinary, seededRandom((seed ^ 0x3c6ef372) | 0)),
    ...chooseRemovals(alive.filter((o) => difficultClutter.has(o)), groundKeep.difficult, seededRandom((seed ^ 0x7f4a7c15) | 0)),
  ]);
  for (let i = objects.length - 1; i >= 0; i--) { if (groundDoomed.has(objects[i])) { objects.splice(i, 1); } }
  clutterKept -= groundDoomed.size;
  // then thin the rubble (what is left of it) on its own seeded stream, so every other piece stays exactly where it was
  const rubble = clutterObjects.filter((o) => RUBBLE_NAME.test(o.name) && objects.includes(o));
  const rubbleDoomed = chooseRemovals(rubble, rubbleKeep, seededRandom((seed ^ 0x2f6b9c31) | 0));
  for (let i = objects.length - 1; i >= 0; i--) { if (rubbleDoomed.has(objects[i])) { objects.splice(i, 1); } }
  clutterKept -= rubbleDoomed.size;

  // ---------- bookcases and pictures: flush on the room-facing wall faces, composed after the clutter on their own stream ----------
  // A bookcase is a shallow shelf with rows of books along it (the packs' own bookcases are deep corner pieces, which would add
  // blocking squares the encounter does not have). Pictures, mirrors, a clock and posters are drawn from above as thin frames and
  // flat sheets. Each goes only where the face is free: clear of doorways, lamps, shelves, furniture and the clutter.
  // Using a stream of their own means none of the layout above moves.
  const hangRng = seededRandom((seed ^ 0x6a09e667) | 0);
  const hr = (a, b) => a + (b - a) * hangRng();
  const hpick = (list) => list[Math.floor(hangRng() * list.length)];
  const placedClutter = clutterObjects; // everything the layout placed (not only what the cuts kept), so a different cut never moves a picture
  const blockedAt = (x, y, pad) => bigProps.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + pad) || placedClutter.some((o) => Math.hypot(o.x - x, o.y - y) < 55 + pad / 2);
  const BOOKCASE_SLABS = ['Dungeondraft:shelf_2a:objects', 'Dungeondraft:shelf_2b:objects', 'Dungeondraft:shelf_4a:objects', 'Dungeondraft:shelf_4b:objects'];
  const BOOK_ROWS = ['Dungeondraft:books_side_1a:objects', 'Dungeondraft:books_side_2a:objects', 'Dungeondraft:books_side_3a:objects'];
  const PICTURES = ['Buildings:Painting_Upright_01:objects', 'Buildings:Painting_Upright_02:objects', 'Buildings:Painting_Wall_01:objects', 'Buildings:Painting_Wall_02:objects', 'Buildings:Painting_Wall_03:objects', 'Buildings:Painting_Wall_04:objects', 'Buildings:Mirror_Upright:objects', 'Buildings:Painting_Upright_Covered:objects'];
  /** How likely each free square of a face is to take a bookcase or a picture, by room. */
  const HANG = { records: { books: 0.4, art: 0.3 }, common: { books: 0.22, art: 0.3 }, corridor: { books: 0, art: 0.3 }, store: { books: 0, art: 0.1 } };
  let bookcases = 0, pictures = 0;
  /** Whether [lo, hi] along a face is clear of the doorways, the stretch ends and everything already hung there. */
  const freeSpan = (line, stretch, side, lo, hi) => lo >= stretch.from + 130 && hi <= stretch.to - 130 && !dressed.some((d) => d.key === faceKey(line, side) && lo < d.hi + 40 && hi > d.lo - 40);
  /** Hang one piece on a face: returns false when the spot is taken. `books` lays rows of books along it. */
  function hang(line, stretch, side, at, spec, { s, books = false, crooked = 0 }) {
    const tex = T(spec), half = halfThickness(line.outer);
    const len = tex.w * s, depth = tex.h * s;
    const lo = stretch.from + at - len / 2, hi = stretch.from + at + len / 2;
    if (!freeSpan(line, stretch, side, lo, hi)) { return false; }
    const back = half + depth / 2 + 3;
    for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const [x, y] = structure.faceSpot(stretch, side.n, at + f * len, back);
      if (blockedAt(x, y, 60)) { return false; }
    }
    const rot = structure.wallRotation(side.n);
    const [x, y] = structure.faceSpot(stretch, side.n, at, back);
    place(tex, x, y, { scale: s, rot: rot + crooked + hr(-0.02, 0.02), layer: books ? LAYER.furniture : LAYER.onTop });
    if (books) {
      const rows = len > 420 ? [-0.28, 0, 0.28] : [-0.2, 0.2];
      for (const f of rows) {
        const [bx, by] = structure.faceSpot(stretch, side.n, at + f * len + hr(-14, 14), back + hr(-5, 5));
        place(hpick(BOOK_ROWS), bx, by, { scale: hr(0.92, 1.05), rot: rot + hr(-0.06, 0.06), layer: LAYER.onTop });
      }
    }
    dressed.push({ key: faceKey(line, side), lo, hi });
    return true;
  }
  // bookcases first (they need the most room), then pictures in the gaps; positions every half square, so a free stretch is found
  for (const pass of ['books', 'art']) {
    for (const line of structure.lines) {
      for (const stretch of line.stretches) {
        for (const side of stretch.sides) {
          const rate = HANG[side.area]?.[pass];
          if (!rate) { continue; }
          for (let at = S / 2; at < stretch.to - stretch.from; at += S / 2) {
            if (hangRng() > rate) { continue; }
            if (pass === 'books') {
              if (hang(line, stretch, side, at + hr(-30, 30), hpick(BOOKCASE_SLABS), { s: hr(0.95, 1.15), books: true })) { bookcases++; }
            } else {
              const crooked = hangRng() < 0.25 ? hr(-0.3, 0.3) : 0; // a ransacked house: some pictures knocked askew
              if (hang(line, stretch, side, at + hr(-40, 40), hpick(PICTURES), { s: hr(0.92, 1.1), crooked })) { pictures++; }
            }
          }
        }
      }
    }
  }
  // a few things worth being sure of: a clock in the common room, posters in the corridor and the storeroom
  const SPECIALS = [['common', 'Scenes:wall_clock_1a:objects', 0.95], ['corridor', 'Modular:poster_1a:objects', 0.85], ['corridor', 'Modular:poster_3a:objects', 0.85], ['store', 'Modular:poster_4a:objects', 0.85]];
  for (const [area, spec, s] of SPECIALS) {
    const faces = structure.lines.flatMap((line) => line.stretches.flatMap((stretch) => stretch.sides.filter((side) => side.area === area).map((side) => ({ line, stretch, side }))));
    for (let tries = 0; tries < 60; tries++) {
      const { line, stretch, side } = hpick(faces);
      if (hang(line, stretch, side, hr(150, stretch.to - stretch.from - 150), spec, { s, crooked: hr(-0.04, 0.04) })) { pictures++; break; }
    }
  }
  // one picture has come off its nail and lies where it fell
  place('Buildings:Painting_Upright_01:objects', 2230 + hr(-20, 20), 1790 + hr(-20, 20), { scale: 1, rot: 0.6 + hr(-0.2, 0.2), layer: LAYER.furniture });
  pictures++;

  // ---------- shadows (Baileywiki BW pack): wall bases and the biggest props ----------
  // Composed last from their own RNG so the layout above does not move. The wall strips are paths on SHADOW_PATH_LAYER (below the
  // walls, above every prop, so they shade what they cross). Each stands between the doorways and fades to the left of travel,
  // so every run is ordered with the room (or street) it shades on its left. The circles are objects on SHADOW_LAYER under the
  // biggest props, exempt from the 0.8-1.2 scale range, and must not be buried under a pattern on a higher layer.
  // the seam lines across the doorways go first, under the shadows; layer 100 is above every pattern and below the props
  const seamTex = T(SEAM_LINE);
  const paths = structure.seams.map((points) => pathRecord(seamTex, points, seamTex.h, LAYER.seam, 'seam'));
  for (const line of structure.lines) {
    for (const stretch of line.stretches) {
      for (const side of stretch.sides) {
        if (!side.area) { continue; }
        const options = line.outer && side.area === 'street' ? SHADE_STREET : SHADE_INSIDE;
        const dir = [-side.n[1], side.n[0]]; // left of this direction is the side the shade falls on
        const along = (stretch.b[0] - stretch.a[0]) * dir[0] + (stretch.b[1] - stretch.a[1]) * dir[1] > 0;
        const points = along ? [stretch.a, stretch.b] : [stretch.b, stretch.a];
        paths.push(shadowPathRecord(T, options, points, LAYER.shadowPath, 'wall'));
      }
    }
  }
  const buried = patterns.filter((p) => p.layer > SHADOW_LAYER).map((p) => p.points);
  circleShadows(casters, { seed, sizePerScale: 520, T }).forEach(({ object, radius, centre: [cx, cy] }, i) => {
    const hit = [];
    for (let dx = -radius; dx <= radius; dx += 64) { for (let dy = -radius; dy <= radius; dy += 64) { if (Math.hypot(dx, dy) <= radius) { hit.push([cx + dx, cy + dy]); } } }
    const bad = hit.find((q) => buried.some((poly) => pointInPolygon(q, poly)));
    if (bad) { throw new Error(`circle shadow under (${Math.round(casters[i].x)}, ${Math.round(casters[i].y)}) would be buried under a higher-layer pattern near (${Math.round(bad[0])}, ${Math.round(bad[1])})`); }
    objects.push(object);
  });

  return {
    world: { cols: COLS, rows: ROWS, size: S },
    terrain, patterns, walls, paths, objects, structure,
    stats: { clutter: clutterKept, clutterPlaced: clutterObjects.length, groundBefore, groundAfter: groundBefore - groundDoomed.size, ordinaryBefore: ordinaryAlive, ordinaryAfter: [...groundDoomed].filter((o) => !difficultClutter.has(o)).length === 0 ? ordinaryAlive : ordinaryAlive - [...groundDoomed].filter((o) => !difficultClutter.has(o)).length, rubbleBefore: rubble.length, rubbleAfter: rubble.length - rubbleDoomed.size, wallDetail, bookcases, pictures, objects: objects.length, paths: paths.length, propShadows: casters.length },
  };
}
