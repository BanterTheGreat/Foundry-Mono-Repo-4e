// Composes the Cauldron Hill entrance ("the west Nettles front door" of the Obscurati facility, seen from the Bleak Gate) as plain data:
// terrain paint, patterns, walls with doorways, cliff / stair / rail paths and objects. ZEITGEIST Act One, Adventure Five.
//
// The look is the Bleak Gate: a lightless shadow-mirror of Flint's Nettles. Cold grey ground with no colour in it, dead wood, dark
// mire where the undergrowth has gone to rot, black pools of leaked witchoil, cinder and slag, and the one made thing in the
// landscape, a steel gate in the hill with copper pipes, gas lamps and rail track behind it.
//
// Follows the user's mapping rules (see the dungeondraft skill):
//  1 object scale stays within 0.8-1.2        2 no object shadows (the writer turns them off)
//  3 clutter everywhere at the standing calibration (CLUTTER_CUTS), denser on difficult terrain
//  4 props sit loosely, rotated and off square centres
//  5 walls are lines on grid lines; the squares themselves are walkable
//  6 buildings from walls + patterns + terrain, no cave/building tool
//  7 every height change shows a continuous cliff, broken only where a worn ascent climbs it
// Deterministic for a given seed. Needs the texture index (index/build-index.mjs).
import { blob, distToSegment, pointInPolygon, rectPolygon, seededRandom } from '../../lib/geometry.mjs';
import { findTexture } from '../../lib/packs.mjs';
import { CLUTTER_CUTS, SCALE_MAX, SCALE_MIN, WALL_LAMPS, applyClutterCuts, assertThemes, buildObject, circleShadows, clamp, makeFam, orderWalls, pathRecord, patternRecord, randomHelpers, wallRecord } from '../../lib/scene-kit.mjs';
import { SHADOW_LAYER } from '../../lib/shadows.mjs';
import { COLS, ROWS, S, parseGrid } from './grid.mjs';
import { deriveStructure } from './structure.mjs';

export { CLUTTER_CUTS, SCALE_MAX, SCALE_MIN };

/** Layers: floors are patterns at -400 / -100; cliffs 100; stairs and rails 200; clutter and props 300; canopies and wall lamps 700. */
export const LAYER = { shadow: SHADOW_LAYER, cliff: 100, ground: 200, clutter: 300, prop: 300, canopy: 700, lamp: 700 };

/** Wall materials, by what the wall is made of; every doorway is the invisible portal (craft rule 8), so doors can be placed by hand. */
export const WALL_TEXTURE = { steel: 'Buildings:metaldark:walls', timber: 'Interior:wood2a:walls', stone: 'Seasons:rocks02:walls' };
export const DOOR_TEXTURE = 'Interior:empty:portals';
export const FLOOR = { steel: 'Buildings:Floor_Metal_Grate_01:patterns', guard: 'Crosshead:ch_wood_dark:patterns', shack: 'Crosshead:ch_wood_dark:patterns', apron: 'Seasons:Stone_Tiled_Dark:patterns' };
/** Four terrain slots: cold bare ground, trampled cold dirt (the road), dark mire (scrub and grove), rocky ground (ledges, the trench). */
export const TERRAIN = ['Seasons:ch_stonecold_base:terrain', 'Elements:cold_dirt_texture:terrain', 'Crosshead:ch_swamp:terrain', 'Elements:cold_dirt_to_stone:terrain'];
export const CLIFF = 'Seasons:terrain_stonecold_cliff:paths';
export const RAMP = 'Dungeondraft:stairs_path:paths';
export const RAILS = 'Above&Below:mine_tracks1:paths';
/** Under a prop whose longest side reaches this many px the circular shadow is darker (075), otherwise 050. */
export const BIG_PROP_PX = 450;

const hash = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth 2-D value noise in [0, 1). */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => 0.62 * vnoise(x, y, s) + 0.38 * vnoise(x * 2.3, y * 2.3, s + 7);
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function composeScene(html, { seed = 20261107, clutterCuts = CLUTTER_CUTS } = {}) {
  const grid = parseGrid(html);
  const st = deriveStructure(grid);
  const rng = seededRandom(seed);
  const { rr, pick } = randomHelpers(rng);
  const W = COLS * S, H = ROWS * S;
  const T = findTexture;
  const centre = st.centre;

  const objects = [];
  const clutterObjects = []; // placed ground clutter, so the cuts can thin exactly these
  const circles = []; // keep-out circles for clutter: { x, y, r }
  const casters = []; // the biggest props, which get a circular shadow underneath: { x, y, size, strength }

  /** Place one object. `scale` is used as given; `px` asks for a size and is clamped into the allowed scale range. */
  function place(spec, x, y, { scale, px, rot = 0, mirror = false, layer = LAYER.prop, keep = 0, cast = null }) {
    const tex = typeof spec === 'string' ? T(spec) : spec;
    const { object, radius } = buildObject(tex, x, y, { scale, px, rot, mirror, layer });
    objects.push(object);
    if (keep) { circles.push({ x, y, r: radius * keep }); }
    if (cast) { casters.push({ x, y, size: radius * 2, strength: cast === true ? (radius * 2 >= BIG_PROP_PX ? '075' : '050') : cast }); }
    return object;
  }
  const fam = makeFam(300);
  const cellOf = (x, y) => grid.at(Math.floor(x / S) + 1, Math.floor(y / S) + 1);
  const classAt = (x, y) => st.classOf(Math.floor(x / S) + 1, Math.floor(y / S) + 1);

  // ---------- terrain: cold grey ground, a trampled road to the gate, dark mire, rocky ledges ----------
  const terrain = { textures: TERRAIN.map(T) };
  {
    const TW = COLS * 4, TH = ROWS * 4;
    const raw = new Array(TW * TH * 4).fill(0);
    const isRoad = (cell) => cell.c >= 19 && cell.c <= 22 && cell.r >= 7 && cell.r <= 23 && cell.kind !== 'tree';
    const base = (cell, x, y) => {
      const cls = st.classOf(cell.c, cell.r);
      if (cls === 'rock') { return [0, 0, 0, 1]; }
      if (st.roomOf.has(`${cell.c},${cell.r}`)) { return [1, 0, 0, 0]; }
      if (cls === 'ledge' || cls === 'ramp') { return [0.12 + 0.1 * vnoise(x / 300, y / 300, 5), 0, 0.04, 0.84]; }
      if (cls === 'trench') { return [0.08, 0, 0.55 + 0.2 * vnoise(x / 200, y / 200, 6), 0.3]; }
      if (cell.kind === 'diff') { return [0.14, 0, 0.86, 0]; }
      if (isRoad(cell)) { return [0.1, 0.9, 0, 0]; }
      const worn = 0.1 + 0.55 * smooth(0.55, 0.72, fbm(x / 420, y / 420, 3));
      const footOfCliff = cell.r === 7 ? 0.55 : 0; // the strip of ground under the hill face is stonier
      return [Math.max(0, 1 - worn - footOfCliff), worn, 0, footOfCliff];
    };
    for (let ty = 0; ty < TH; ty++) {
      for (let tx = 0; tx < TW; tx++) {
        const x = (tx + 0.5) * 64, y = (ty + 0.5) * 64;
        // the edges of the patches wander: sample the square under a warped point
        const wx = clamp(x + (fbm(x / 230, y / 230, 11) - 0.5) * 140, 1, W - 1), wy = clamp(y + (fbm(x / 230, y / 230, 12) - 0.5) * 140, 1, H - 1);
        const w = base(cellOf(wx, wy), x, y);
        const o = (ty * TW + tx) * 4;
        for (let i = 0; i < 4; i++) { raw[o + i] = w[i]; }
      }
    }
    // soften the patch edges: two passes of a small blur over the weights
    let src = raw;
    for (let pass = 0; pass < 2; pass++) {
      const dst = new Array(raw.length).fill(0);
      for (let ty = 0; ty < TH; ty++) {
        for (let tx = 0; tx < TW; tx++) {
          let n = 0;
          const acc = [0, 0, 0, 0];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const sx = tx + dx, sy = ty + dy;
              if (sx < 0 || sy < 0 || sx >= TW || sy >= TH) { continue; }
              const o = (sy * TW + sx) * 4;
              for (let i = 0; i < 4; i++) { acc[i] += src[o + i]; }
              n++;
            }
          }
          const o = (ty * TW + tx) * 4;
          for (let i = 0; i < 4; i++) { dst[o + i] = acc[i] / n; }
        }
      }
      src = dst;
    }
    const splat = new Array(TW * TH * 4).fill(0);
    for (let k = 0; k < TW * TH; k++) {
      const ints = [0, 1, 2, 3].map((i) => Math.round(255 * clamp(src[k * 4 + i], 0, 1)));
      ints[0] += 255 - ints.reduce((a, b) => a + b, 0);
      for (let i = 0; i < 4; i++) { splat[k * 4 + i] = ints[i]; }
    }
    terrain.splat = splat;
  }

  // ---------- floors (patterns) ----------
  const patterns = [];
  const pattern = (spec, points, layer) => { patterns.push(patternRecord(T(spec), points, layer)); };
  const cellRect = ({ c1, r1, c2, r2 }) => rectPolygon((c1 - 1) * S, (r1 - 1) * S, c2 * S, r2 * S);
  // the hill's rock mass and the trench core carry no pattern: the rocky terrain paint shows through, so they read as one with the ledges
  for (const rect of st.floors.steel) { pattern(FLOOR.steel, cellRect(rect), -100); }
  for (const rect of st.floors.guard) { pattern(FLOOR.guard, cellRect(rect), -100); }
  for (const rect of st.floors.shack) { pattern(FLOOR.shack, cellRect(rect), -100); }
  // broken flagstones at the foot of the gate, worn through to the earth: an organic patch, not a rectangle
  pattern(FLOOR.apron, blob(rng, 5120, 1960, 820, 330, { n: 34, jitter: 0.22 }), -100);

  // ---------- walls: lines on grid lines, doorways cut into them ----------
  // A wall draws over every wall before it: shells go last, partitions that run into them first.
  const matOf = new Map();
  const walls = orderWalls(st.walls.map((w) => {
    const record = wallRecord(T(WALL_TEXTURE[w.material]), { loop: false, points: w.points, openings: w.openings }, T(DOOR_TEXTURE));
    matOf.set(record, w);
    return record;
  }), (record) => (matOf.get(record).partition ? 0 : 1));
  const wallSegs = st.lines.map((l) => l.points);
  const cliffSegs = st.cliffs.map((c) => [c.a, c.b]);
  const halfThickness = (material) => T(WALL_TEXTURE[material]).h / 2;

  // ---------- paths: cliffs (rule 7), worn ascents, the rail track ----------
  const paths = [];
  for (const run of st.cliffs) {
    // The strip is lit from its top edge, so run the path with its top (left of travel on screen) toward the high ground.
    const d = [-run.n[1], run.n[0]];
    const forward = (run.b[0] - run.a[0]) * d[0] + (run.b[1] - run.a[1]) * d[1] > 0;
    const [p0, p1] = forward ? [run.a, run.b] : [run.b, run.a];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    // Past the map edge the cliff runs on; where it meets a wall or another cliff it runs 30 px on under it.
    const atEdge = (p) => p[0] <= 0 || p[1] <= 0 || p[0] >= W || p[1] >= H;
    const ext0 = atEdge(p0) ? 90 : 30, ext1 = atEdge(p1) ? 90 : 30;
    const start = [p0[0] - d[0] * ext0, p0[1] - d[1] * ext0];
    const end = [p1[0] + d[0] * ext1, p1[1] + d[1] * ext1];
    const pts = [start];
    const n = Math.max(1, Math.round(len / 340));
    for (let i = 1; i < n; i++) {
      const t = i / n, w = rr(-14, 14); // wander across the line, never along it
      pts.push([start[0] + (end[0] - start[0]) * t - run.n[0] * w, start[1] + (end[1] - start[1]) * t - run.n[1] * w]);
    }
    pts.push(end);
    run.path = pts;
    paths.push(pathRecord(T(CLIFF), pts, run.drop >= 10 ? 316 : 270, LAYER.cliff, 'cliff'));
  }
  for (const ramp of st.ramps) {
    const xm = (ramp.x0 + ramp.x1) / 2;
    paths.push(pathRecord(T(RAMP), [[xm, ramp.y1 + 6], [xm, ramp.y0 - 6]], 480, LAYER.ground, 'ramp'));
  }
  // light rail track, two lines side by side, from the tunnel out through the gate and a few squares across the apron
  for (const x of [4992, 5248]) {
    paths.push(pathRecord(T(RAILS), [[x, -40], [x + rr(-6, 6), 1536], [x + rr(-8, 8), 2260]], 256, LAYER.ground, 'rails'));
  }

  // ---------- keep-out areas for clutter ----------
  const special = new Set(['tree', 'boulder', 'machine', 'ward', 'slag', 'cart', 'furn', 'debris', 'pyre', 'ramp', 'start', 'lever', 'gate']);
  for (const cell of grid.cells.values()) {
    if (!special.has(cell.kind)) { continue; }
    const [x, y] = centre(cell.c, cell.r);
    circles.push({ x, y, r: cell.kind === 'start' ? 150 : 175 });
  }
  const nearLine = (x, y, d) => wallSegs.some((seg) => distToSegment(x, y, seg) < d) || cliffSegs.some((seg) => distToSegment(x, y, seg) < d);
  const clear = (x, y, r) => !circles.some((c) => Math.hypot(c.x - x, c.y - y) < r + c.r);

  // ---------- dead wood: a trunk in every tree square, broad bare canopies above the walls layer ----------
  const TREES = [['Seasons:dead_tree_04:objects', 1.0], ['Crosshead:dead_tree_02:objects', 1.08], ['Scenes:dead_tree_01a:objects', 0.88], ['Seasons:dead_tree_12:objects', 0.86]];
  for (const cell of grid.of('tree')) {
    const [x, y] = centre(cell.c, cell.r);
    const [spec, base] = pick(TREES);
    const o = place(spec, x + rr(-30, 30), y + rr(-30, 30), { scale: +clamp(base * rr(0.94, 1.06), SCALE_MIN, SCALE_MAX).toFixed(3), rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.canopy, cast: '050' });
    circles.push({ x: o.x, y: o.y, r: 120 });
  }
  // boulders on the ledges: stonecold rock, big enough to fill their square
  {
    const rocks = fam('Seasons', 'rock_stonecold', { min: 240, max: 420 });
    for (const cell of grid.of('boulder')) {
      const [x, y] = centre(cell.c, cell.r);
      place(pick(rocks), x + rr(-24, 24), y + rr(-24, 24), { scale: rr(0.95, 1.15), rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.prop, keep: 0.9, cast: true });
    }
  }

  // ---------- the steel gate and the foyer behind it ----------
  {
    // the hydraulic mechanism fills (16-17,5-6); a pipe wheel hangs on the wall above it, a feed pipe runs to the door side
    const [mx, my] = [4096 + rr(-10, 10), 1280 + rr(-10, 10)];
    place('Mechanism:pressure_tank_1a:objects', mx, my, { scale: 0.84, rot: rr(-0.06, 0.06), layer: LAYER.prop, keep: 1, cast: '075' });
    place('Mechanism:pipe_wheel_1a:objects', 4090 + rr(-30, 30), 768 + halfThickness('steel') + 90 + rr(0, 8), { scale: 1.0, rot: rr(-0.03, 0.03), layer: LAYER.prop });
    place('Mechanism:pipe_object_1a:objects', 4390 + rr(-10, 10), 1250 + rr(-24, 24), { scale: 0.8, rot: Math.PI / 2 + rr(-0.06, 0.06), layer: LAYER.prop });
    // the lever that works the gate, at (18,4)
    const [lx, ly] = centre(18, 4);
    place('Above&Below:mechanism_lever_01a:objects', lx + 36 + rr(-8, 8), ly + rr(-14, 14), { scale: 0.8, rot: Math.PI / 2 + rr(-0.05, 0.05), layer: LAYER.prop });
    // the two hand-cranked rail carts in the lobby at (20,4) and (21,4), on the track
    for (const c of [20, 21]) {
      const [cx, cy] = centre(c, 4);
      place('Crosshead:mine_cart:objects', cx + rr(-14, 14), cy + rr(-24, 24), { scale: 1.0, rot: rr(-0.05, 0.05), layer: LAYER.prop, keep: 0.9 });
    }
    // the guard room: two cots and a footlocker against the east wall at (25,4-6), a table and a weapon rack
    const [c4x, c4y] = centre(25, 4), [c5x, c5y] = centre(25, 5), [c6x, c6y] = centre(25, 6);
    place('Buildings:Bed_Cot_01:objects', c4x + 6 + rr(-8, 8), c4y + rr(-8, 8), { scale: 0.8, rot: Math.PI / 2 + rr(-0.04, 0.04), layer: LAYER.prop, keep: 0.9 });
    place('Interior:crate_4a:objects', c5x + 28 + rr(-8, 8), c5y + rr(-10, 10), { scale: 0.9, rot: rr(-0.1, 0.1), layer: LAYER.prop, keep: 0.8 });
    place('Buildings:Bed_Cot_01:objects', c6x + 6 + rr(-8, 8), c6y + rr(-8, 8), { scale: 0.8, rot: -Math.PI / 2 + rr(-0.04, 0.04), layer: LAYER.prop, keep: 0.9 });
    const [tx, ty] = centre(24, 5);
    place('Dungeondraft:table_circle_1a:objects', tx + rr(-14, 14), ty + rr(-14, 14), { scale: 1.1, rot: rr(0, 6.28), layer: LAYER.prop, keep: 0.9 });
    place('Crosshead:weapon_rack_01:objects', 6150 + rr(-30, 30), 768 + halfThickness('steel') + 80 + rr(0, 6), { scale: 0.9, rot: rr(-0.02, 0.02), layer: LAYER.prop });
    // a puddle of witchoil by the carts and a skid of drips towards the gate: the facility leaks
    place('Crosshead:tar_03:objects', 5100 + rr(-30, 30), 1380 + rr(-20, 20), { scale: 1.0, rot: rr(0, 6.28), layer: LAYER.clutter });
    place('Crosshead:tar_01:objects', 5210 + rr(-30, 30), 1500 + rr(-10, 10), { scale: 1.0, rot: rr(0, 6.28), layer: LAYER.clutter });
    circles.push({ x: 5100, y: 1380, r: 150 }, { x: 5210, y: 1500, r: 100 });
  }

  // ---------- gas lamps on the steel interior faces (layer 700, mounting edge to the wall) ----------
  const wallRotation = (n) => Math.atan2(-n[0], n[1]);
  let lamps = 0;
  for (const line of st.lines) {
    if (line.material !== 'steel') { continue; }
    for (const stretch of line.stretches) {
      for (const side of stretch.sides) {
        if (!side.cls || !(side.cls in { lobby: 1, mech: 1, guard: 1 })) { continue; }
        const length = stretch.to - stretch.from;
        if (length < 200) { continue; }
        const count = Math.max(1, Math.round(length / (S * 3.2)));
        for (let k = 0; k < count; k++) {
          const t = (length / count) * (k + 0.5) + rr(-20, 20);
          const along = stretch.from + t, back = halfThickness('steel') + 52;
          const x = stretch.horizontal ? along : stretch.fixed + side.n[0] * back, y = stretch.horizontal ? stretch.fixed + side.n[1] * back : along;
          place(pick(WALL_LAMPS), x, y, { scale: 0.9, rot: wallRotation(side.n) + rr(-0.03, 0.03), layer: LAYER.lamp });
          lamps++;
        }
      }
    }
  }
  // the tunnel mouth runs on into the hill: its walls get a lamp or two as well (they are steel stretches facing the lobby class)

  // ---------- outside: ward posts, slag heaps, the cold pyre, ring gates ----------
  for (const cell of grid.of('ward')) {
    const [x, y] = centre(cell.c, cell.r);
    place('Seasons:rock_stonecold_10:objects', x + rr(-14, 14), y + 26 + rr(-6, 6), { scale: rr(1.0, 1.15), rot: rr(0, 6.28), layer: LAYER.prop, keep: 0.8 });
    place('Modular:lantern_post_3b:objects', x + rr(-12, 12), y + rr(-14, 8), { scale: 1.2, rot: rr(-0.1, 0.1), layer: LAYER.prop, keep: 0.5 });
    place('Crosshead:tar_01:objects', x + 60 + rr(-8, 8), y + 66 + rr(-8, 8), { scale: 1.0, rot: rr(0, 6.28), layer: LAYER.clutter });
  }
  for (const cell of grid.of('slag')) {
    const [x, y] = centre(cell.c, cell.r);
    place('Above&Below:coal_03:objects', x + rr(-24, 24), y + rr(-24, 24), { scale: rr(0.8, 0.9), rot: rr(0, 6.28), mirror: rng() < 0.5, layer: LAYER.prop, keep: 0.9 });
    for (let i = 0; i < 2; i++) { place('Above&Below:coal_01:objects', x + rr(-70, 70), y + rr(-70, 70), { scale: rr(0.85, 1.1), rot: rr(0, 6.28), layer: LAYER.prop }); }
  }
  for (const cell of grid.of('pyre')) {
    const [x, y] = centre(cell.c, cell.r);
    place('Seasons:firepit_01a:objects', x + rr(-14, 14), y + rr(-14, 14), { scale: 0.95, rot: rr(0, 6.28), layer: LAYER.prop, keep: 0.9, cast: true });
    for (const [dx, dy] of [[-96, 70], [88, -64], [30, 110]]) { place(pick(fam('Seasons', 'rock_stonecold', { min: 70, max: 130 })), x + dx + rr(-14, 14), y + dy + rr(-14, 14), { scale: rr(0.9, 1.1), rot: rr(0, 6.28), layer: LAYER.prop }); }
  }
  {
    // the four ring gates of the hidden trench: rusted cogs lie across each pair of squares
    const gates = grid.of('gate').sort((a, b) => a.r - b.r || a.c - b.c);
    const pairs = [];
    const used = new Set();
    for (const cell of gates) {
      if (used.has(`${cell.c},${cell.r}`)) { continue; }
      const partner = gates.find((o) => !used.has(`${o.c},${o.r}`) && o !== cell && ((o.r === cell.r && o.c === cell.c + 1) || (o.c === cell.c && o.r === cell.r + 1)));
      if (!partner) { throw new Error(`Ring gate square (${cell.c},${cell.r}) has no partner`); }
      used.add(`${cell.c},${cell.r}`);
      used.add(`${partner.c},${partner.r}`);
      pairs.push([cell, partner]);
    }
    if (pairs.length !== 4) { throw new Error(`Expected four ring gates, found ${pairs.length}`); }
    const cogs = fam('Buildings', 'gears_metal', { min: 330, max: 460 });
    for (const [a, b] of pairs) {
      const [ax, ay] = centre(a.c, a.r), [bx, by] = centre(b.c, b.r);
      const cog = pick(cogs);
      const o = place(cog, (ax + bx) / 2 + rr(-16, 16), (ay + by) / 2 + rr(-16, 16), { scale: rr(0.9, 1.05), rot: rr(0, 6.28), mirror: rng() < 0.5, layer: LAYER.prop });
      circles.push({ x: o.x, y: o.y, r: 190 });
    }
  }

  // ---------- witchoil: black pools where the Bleak Gate has seeped into the ground ----------
  {
    const pools = fam('Crosshead', 'tar', { min: 230, max: 460 });
    const spots = [[2700, 2300], [7600, 3050], [3400, 5600], [8600, 5200], [5100, 4300], [7000, 2650], [1700, 4800], [8900, 1900]];
    for (const [x, y] of spots) {
      if (['rock', 'ledge'].includes(classAt(x, y)) || !clear(x, y, 90)) { continue; }
      place(pick(pools), x + rr(-60, 60), y + rr(-50, 50), { scale: rr(0.9, 1.15), rot: rr(0, 6.28), mirror: rng() < 0.5, layer: LAYER.clutter, keep: 0.8 });
    }
  }

  // ---------- the abandoned shacks: rotted boards, a broken cupboard, spilled barrels ----------
  {
    const rooms = new Map();
    for (const cell of grid.cells.values()) {
      const room = st.roomOf.get(`${cell.c},${cell.r}`);
      if (room && room.startsWith('shack')) { rooms.set(room, [...(rooms.get(room) ?? []), cell]); }
    }
    const junk = ['Buildings:Broken_Plank_02:objects', 'Above&Below:plank_a05:objects', 'Interior:crate_broken_5a:objects', 'Interior:barrel_0a:objects'];
    for (const cell of grid.of('debris')) {
      const [x, y] = centre(cell.c, cell.r);
      place('Buildings:Broken_Plank_02:objects', x + rr(-30, 30), y + rr(-30, 30), { scale: rr(1.0, 1.15), rot: rr(0, 6.28), layer: LAYER.prop, keep: 0.8 });
      place(pick(junk.slice(1)), x + rr(-60, 60), y + rr(-60, 60), { scale: rr(0.9, 1.1), rot: rr(0, 6.28), layer: LAYER.prop });
    }
    for (const [room, cells] of rooms) {
      // one big piece of ruined furniture against a wall in each room
      const cell = cells.find((c) => c.kind === 'open' && st.lines.some((l) => l.points.some(([px, py]) => Math.hypot(px - (c.c - 0.5) * S, py - (c.r - 0.5) * S) < S))) ?? cells[0];
      const [x, y] = centre(cell.c, cell.r);
      if (room !== 'shackB') { place('Dungeondraft:broken_cabinet_1a:objects', x + rr(-30, 30), y + rr(-30, 30), { scale: 0.85, rot: rr(0, 6.28), layer: LAYER.prop, keep: 0.8 }); }
    }
  }
  // bone piles where the ambush squads lie in wait, and one beside the road
  for (const [x, y] of [[640, 4450], [9650, 4420], [4650, 3200]]) {
    if (clear(x, y, 60)) { place('Dungeondraft:skulls_1a:objects', x + rr(-30, 30), y + rr(-30, 30), { scale: rr(0.85, 1.0), rot: rr(0, 6.28), layer: LAYER.clutter, keep: 0.7 }); }
  }

  // ---------- clutter (rule 3): light on ordinary ground, thick on scrub and scree ----------
  const THEMES = {
    stones: [fam('Seasons', 'rock_stonecold', { min: 40, max: 170 }), fam('Seasons', 'rock_stonecold', { min: 40, max: 130 })],
    waste: [fam('Crosshead', 'dead_grass', { min: 50, max: 200 }), fam('Death', 'grass', { min: 110, max: 230, name: /^grass_09c/ }), fam('Buildings', 'stick_twig', { min: 40, max: 200 })],
    scrub: [fam('Death', 'grass', { min: 110, max: 230, name: /^grass_09c/ }), fam('Crosshead', 'dead_grass', { min: 50, max: 200 }), fam('Dungeondraft', 'roots', { min: 230, max: 300 })],
    scree: [fam('Seasons', 'rock_stonecold', { min: 60, max: 220 }), fam('Seasons', 'rock_stonecold', { min: 60, max: 220 })],
    drips: [fam('Crosshead', 'tar', { min: 80, max: 130 }), fam('Seasons', 'rock_stonecold', { min: 40, max: 120 })],
    bones: [fam('Death', 'skeleton_skull', { min: 35, max: 120 })],
  };
  assertThemes(THEMES);
  const rooms = new Set(['lobby', 'mech', 'guard', 'shackA', 'shackB', 'shackE']);
  /** Drop one piece of a theme at (x, y) if the spot is free and in an allowed class. */
  function scatterOne(theme, x, y, okClass) {
    const tex = pick(pick(THEMES[theme]));
    const scale = rr(0.85, 1.15);
    const r = (Math.max(tex.w, tex.h) * scale) / 2 * 0.6;
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20) { return false; }
    const cell = cellOf(x, y);
    if (!okClass(st.classOf(cell.c, cell.r), cell) || special.has(cell.kind)) { return false; }
    if (!clear(x, y, r) || nearLine(x, y, 70 + r * 0.4)) { return false; }
    place(tex, x, y, { scale, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.clutter });
    clutterObjects.push(objects[objects.length - 1]);
    circles.push({ x, y, r: r * 0.55 });
    return true;
  }
  function cluster(theme, cell, size, spread, okClass) {
    const cx = (cell.c - 0.5) * S + rr(-S / 2, S / 2), cy = (cell.r - 0.5) * S + rr(-S / 2, S / 2);
    let placed = 0;
    for (let i = 0; i < size * 6 && placed < size; i++) {
      if (scatterOne(theme, cx + rr(-spread, spread), cy + rr(-spread, spread), okClass)) { placed++; }
    }
  }
  const outdoorsClass = (cls) => cls === 'ground' || cls === 'trench';
  const ledgeClass = (cls) => cls === 'ledge' || cls === 'ramp';
  const all = [...grid.cells.values()];
  const ordinary = all.filter((c) => c.kind === 'open' && st.classOf(c.c, c.r) === 'ground');
  const scrubCells = all.filter((c) => c.kind === 'diff' && st.classOf(c.c, c.r) === 'ground');
  const ledgeScree = all.filter((c) => c.kind === 'diff' && st.classOf(c.c, c.r) === 'ledge');
  const ledgeOpen = all.filter((c) => c.kind === 'open' && st.classOf(c.c, c.r) === 'ledge');
  const trenchCells = all.filter((c) => st.classOf(c.c, c.r) === 'trench' && c.kind !== 'gate');
  const inRooms = all.filter((c) => rooms.has(st.classOf(c.c, c.r)) && c.kind === 'open');
  // ordinary ground detail: sparse
  for (let i = 0; i < 52; i++) { cluster(pick(['stones', 'waste', 'waste', 'drips']), pick(ordinary), 1 + Math.floor(rng() * 3), rr(80, 190), outdoorsClass); }
  for (let i = 0; i < 30; i++) { cluster(pick(['stones', 'waste']), pick(ordinary), 1, 40, outdoorsClass); }
  for (let i = 0; i < 9; i++) { cluster('bones', pick(ordinary), 1, 60, outdoorsClass); }
  for (let i = 0; i < 14; i++) { cluster(pick(['scree', 'waste']), pick(ledgeOpen), 1 + Math.floor(rng() * 2), rr(80, 160), ledgeClass); }
  for (let i = 0; i < 14; i++) { cluster(pick(['drips', 'scree', 'waste']), pick(trenchCells), 1 + Math.floor(rng() * 2), rr(70, 130), outdoorsClass); }
  for (let i = 0; i < 12; i++) { cluster(pick(['drips', 'waste']), pick(inRooms), 1, 80, (cls) => rooms.has(cls)); }
  // difficult terrain: scrub and scree piled noticeably thicker than the ground around it
  for (const cell of scrubCells) {
    if (rng() < 0.78) { cluster('scrub', cell, 2 + Math.floor(rng() * 2), 120, outdoorsClass); }
    if (rng() < 0.3) { cluster('waste', cell, 1, 90, outdoorsClass); }
  }
  for (const cell of ledgeScree) { cluster('scree', cell, 3 + Math.floor(rng() * 2), 120, ledgeClass); }

  // Apply the clutter cuts exactly: a seeded share of what was placed is removed (see applyClutterCuts in lib/scene-kit.mjs).
  const clutterKept = applyClutterCuts(objects, clutterObjects, seed, clutterCuts);

  // ---------- shadows (Baileywiki BW pack): circles under the biggest props only ----------
  // Composed last from their own RNG so the layout above does not move. The circles are objects on SHADOW_LAYER under the biggest props,
  // exempt from the 0.8-1.2 scale range. Shadow PATHS (cliff faces, wall bases) are placed by the user by hand and never generated here.
  const buried = patterns.filter((p) => p.layer > SHADOW_LAYER).map((p) => p.points);
  let propShadows = 0;
  circleShadows(casters, { seed, sizePerScale: 400, T }).forEach(({ object, radius, centre: [cx, cy] }, i) => {
    const hit = [];
    for (let dx = -radius; dx <= radius; dx += 64) { for (let dy = -radius; dy <= radius; dy += 64) { if (Math.hypot(dx, dy) <= radius) { hit.push([cx + dx, cy + dy]); } } }
    const bad = hit.find((q) => buried.some((poly) => pointInPolygon(q, poly)));
    if (bad) { throw new Error(`circle shadow under (${Math.round(casters[i].x)}, ${Math.round(casters[i].y)}) would be buried under a higher-layer pattern near (${Math.round(bad[0])}, ${Math.round(bad[1])})`); }
    objects.push(object);
    propShadows++;
  });

  return {
    world: { cols: COLS, rows: ROWS, size: S },
    terrain, patterns, walls, paths, objects, structure: st,
    stats: { clutter: clutterKept, clutterPlaced: clutterObjects.length, objects: objects.length, paths: paths.length, lamps, propShadows },
  };
}
