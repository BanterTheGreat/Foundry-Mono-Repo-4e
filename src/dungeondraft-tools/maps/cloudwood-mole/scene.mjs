// Composes the Cloudwood mole battlemap ("The Price of a Way Out") as plain data: terrain paint, cliff / stair / plank paths and
// objects. The encounter grid is extended by one square on every side (see grid.mjs).
// Follows the user's mapping rules (see the dungeondraft skill):
//  1 object scale stays within 0.8-1.2        2 no object shadows (the exporter writes them off)
//  3 clutter everywhere, denser on difficult terrain   4 props sit loosely, never dead-centre in a square
//  5/6 no walls and no cave / building tool (this map has no structures)
//  7 every height change shows a continuous cliff, broken only by a stair (a worn flagstone ascent)
// Shadows (Baileywiki BW pack): a soft half shadow along every cliff, falling on the low ground, and a circular shadow under the
// biggest props (canopies, logs, boundary stones, the hearth). Both sit on layer -100 and are composed last from their own seeded
// RNG, so adding or retuning them never moves anything else.
// Deterministic for a given seed. Needs the texture index (index/build-index.mjs).
import { chooseRemovals, seededRandom } from '../../lib/geometry.mjs';
import { familyMembers, findTexture } from '../../lib/packs.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, shadowCircleSpec, shadowPathSpec, shadowPathWidth } from '../../lib/shadows.mjs';
import { COLS, ROWS, S, parseGrid } from './grid.mjs';
import { deriveStructure } from './structure.mjs';

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.2;
/** Compounding clutter cuts requested by the user so far (each 0.15 = 15% less than the level before). Append to cut again. */
export const CLUTTER_CUTS = [0.15, 0.15];

// Layers: paths 100 (cliffs) and 200 (stairs, planks); clutter 300; props 400; tree canopies and hedges 700 (above walls).
export const LAYER = { shadow: SHADOW_LAYER, cliff: 100, ground: 200, clutter: 300, prop: 400, canopy: 700 };

/** Shadow along a cliff: a wide, fairly dark half shadow (hard edge on the cliff line, fading across the low ground). */
export const CLIFF_SHADOW = { edge: 'half', size: 'large', strength: '075' };
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

/** Distance from a point to a polyline. */
function distToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y));
  }
  return best;
}

/** The charcoal road, in square units from the map's top-left: in at the south-west, over the planks, up both banks to the exit. */
const ROAD_U = [[0, 13.6], [2.4, 13.7], [5, 13.3], [6.8, 13.0], [8.6, 12.6], [9, 10.6], [8.8, 8.6], [9.4, 7.3], [11.5, 7.0], [12.6, 7.1], [14, 7.2], [15, 7.6], [16.2, 6.5], [16.8, 5.0], [17.8, 3.6], [19, 3.1], [20.2, 3.0]];
/** Old charcoal stains in the gully and on the terrace: [centre x, centre y, radius x, radius y] in square units. */
const STAINS_U = [[8.0, 9.8, 1.0, 2.6], [12.2, 5.0, 0.9, 2.3], [12.5, 14.2, 1.3, 1.2], [18.0, 12.5, 1.6, 1.4]];

export function composeScene(html, { seed = 20261031, clutterCuts = CLUTTER_CUTS } = {}) {
  const grid = parseGrid(html);
  const st = deriveStructure(grid);
  const rng = seededRandom(seed);
  const rr = (a, b) => a + (b - a) * rng();
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const W = COLS * S, H = ROWS * S;
  const T = findTexture;
  const road = ROAD_U.map(([x, y]) => [x * S, y * S]);

  const objects = [];
  const clutterObjects = []; // placed ground clutter, so the cuts can thin exactly these
  const circles = []; // keep-out circles for clutter: { x, y, r }
  const rects = []; // keep-out rectangles: { x0, y0, x1, y1 }
  const casters = []; // the biggest props, which get a circular shadow underneath: { o, size }

  /** Place one object. `scale` is used as given; `px` asks for a size and is clamped into the allowed scale range. `casts` marks a big prop that gets a shadow. */
  function place(tex, x, y, { scale, px, rot = 0, mirror = false, layer = LAYER.clutter, keep = false, casts = false }) {
    if (tex.colorable) { throw new Error(`${tex.name} is a colorable texture: placed untinted it renders raw red`); }
    const s = scale ?? clamp(px / Math.max(tex.w, tex.h), SCALE_MIN, SCALE_MAX);
    if (s < SCALE_MIN - 1e-9 || s > SCALE_MAX + 1e-9) { throw new Error(`Rule 1: ${tex.name} scale ${s.toFixed(3)} is outside ${SCALE_MIN}-${SCALE_MAX}`); }
    const o = { pack: tex.pack, rel: tex.rel, name: tex.name, x: +x.toFixed(1), y: +y.toFixed(1), scale: +s.toFixed(3), rot: +rot.toFixed(4), mirror, layer };
    objects.push(o);
    const r = (Math.max(tex.w, tex.h) * s) / 2;
    if (keep) { circles.push({ x, y, r: r * 0.8 }); }
    if (casts) { casters.push({ o, size: r * 2 }); }
    return o;
  }
  const fam = (pack, family, { min = 30, max = 400, name } = {}) => familyMembers(pack, family).filter((m) => !m.colorable && Math.max(m.w, m.h) >= min && Math.max(m.w, m.h) <= max && (!name || name.test(m.name)));
  const cellRect = (c1, r1, c2, r2, pad = 0) => ({ x0: (c1 - 1) * S - pad, y0: (r1 - 1) * S - pad, x1: c2 * S + pad, y1: r2 * S + pad });

  // ---------- keep-out areas for clutter ----------
  for (const b of st.stairs) { rects.push({ x0: b.x0 - 30, y0: b.y0 - 30, x1: b.x1 + 30, y1: b.y1 + 30 }); }
  rects.push(cellRect(st.plank.c1, st.plank.r1, st.plank.c2, st.plank.r2, 40));
  for (const t of st.trunks) { rects.push(cellRect(t.c1, t.r1, t.c2, t.r2, 10)); }
  for (const e of st.exits) { rects.push(cellRect(e.c, e.r, e.c, e.r, 0)); }
  rects.push(cellRect(st.cache.c, st.cache.r, st.cache.c, st.cache.r, 20));
  const cliffSegs = st.cliffs.map((c) => [c.a, c.b]);
  const nearCliff = (x, y, d) => cliffSegs.some((seg) => distToPolyline(x, y, seg) < d);
  const clear = (x, y, r) => !rects.some((q) => x + r > q.x0 && x - r < q.x1 && y + r > q.y0 && y - r < q.y1)
    && !circles.some((c) => Math.hypot(c.x - x, c.y - y) < r + c.r);

  // ---------- terrain: forest floor, dark dirt (mud, charcoal, road), shallow stream, lighter moss ----------
  const terrainTextures = ['Seasons:grassmix_dark:terrain', 'Seasons:ch_dirtdark_base:terrain', 'Sea:ch_water_shallow:terrain', 'Seasons:grassmix_base:terrain'].map(T);
  const rectDist = (x, y, q) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.y0 - y, 0, y - q.y1));
  const waterRects = st.water.map((cell) => cellRect(cell.c, cell.r, cell.c, cell.r));
  const TW = COLS * 4, TH = ROWS * 4;
  const splat = new Array(TW * TH * 4).fill(0);
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const x = (tx + 0.5) * 64, y = (ty + 0.5) * 64;
      // the water's edge wanders: measure the distance from a warped point, but keep every water square wet
      const wx = x + (fbm(x / 230, y / 230, 11) - 0.5) * 120, wy = y + (fbm(x / 230, y / 230, 12) - 0.5) * 120;
      const dWarp = Math.min(...waterRects.map((q) => rectDist(wx, wy, q)));
      const inside = waterRects.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
      const wet = Math.max(clamp(1 - dWarp / 60, 0, 1), inside ? 0.94 : 0);
      const rim = clamp(1 - dWarp / 190, 0, 1) * 0.75; // muddy banks
      const stain = Math.max(...STAINS_U.map(([cx, cy, rx, ry]) => smooth(0, 1, 1.15 - Math.hypot((x / S - cx) / rx, (y / S - cy) / ry) + (fbm(x / 160, y / 160, 21) - 0.5) * 0.5)));
      const trail = smooth(0, 1, (118 + (fbm(x / 150, y / 150, 22) - 0.5) * 70 - distToPolyline(x, y, road)) / 70);
      const murk = wet * (0.16 + 0.3 * fbm(x / 200, y / 200, 31)); // rain-swollen: silt clouds the shallow water
      const dark = clamp(Math.max(rim, stain * 0.9, trail), 0, 1) * (1 - wet) + murk;
      const moss = smooth(0.5, 0.68, fbm(x / 420, y / 420, 3)) * 0.85 * (1 - wet) * (1 - dark);
      const f = [1 - wet - dark - moss + murk, dark, wet - murk, moss];
      const ints = f.map((v) => Math.round(255 * clamp(v, 0, 1)));
      ints[0] += 255 - ints.reduce((a, b) => a + b, 0);
      const o = (ty * TW + tx) * 4;
      for (let i = 0; i < 4; i++) { splat[o + i] = ints[i]; }
    }
  }
  const terrain = { textures: terrainTextures, splat };

  // ---------- paths: cliffs (rule 7), stairs, planks ----------
  const paths = [];
  const pathTex = (spec) => T(spec);
  /** A straight path through `pts` with a little wander on interior points. */
  const mkPath = (spec, pts, width, layer, role) => { const tex = pathTex(spec); paths.push({ pack: tex.pack, rel: tex.rel, name: tex.name, points: pts, width, layer, role }); };

  const CLIFF_SMALL = 'Seasons:terrain_dirt_cliff:paths', CLIFF_BIG = 'Seasons:terrain_dirtdark_cliff:paths';
  for (const run of st.cliffs) {
    // The strip is lit from its top edge, so run the path with its top (left of travel on screen) toward the high ground.
    const d = [-run.n[1], run.n[0]];
    const forward = (run.b[0] - run.a[0]) * d[0] + (run.b[1] - run.a[1]) * d[1] > 0;
    const [p0, p1] = forward ? [run.a, run.b] : [run.b, run.a];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    // Past the map edge the cliff runs on; where a stair meets it, it runs 30 px on under the stair.
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
    run.big = run.drop >= 10;
    mkPath(run.big ? CLIFF_BIG : CLIFF_SMALL, pts, run.big ? 320 : 270, LAYER.cliff, 'cliff');
  }
  const STAIR_TEX = ['Scenes:stairs_5a:paths', 'Scenes:stairs_5e:paths'];
  for (const b of st.stairs) {
    const xm = (b.x0 + b.x1) / 2, ym = (b.y0 + b.y1) / 2;
    const spec = pick(STAIR_TEX);
    if (b.axis === 'x') { mkPath(spec, [[b.x0, ym], [b.x1, ym]], b.y1 - b.y0, LAYER.ground, 'stair'); }
    else { mkPath(spec, [[xm, b.y1], [xm, b.y0]], b.x1 - b.x0, LAYER.ground, 'stair'); }
  }
  {
    const p = st.plank, ym = ((p.r1 - 1) * S + p.r2 * S) / 2;
    mkPath('Seasons:planks2B:paths', [[(p.c1 - 1) * S - 70, ym], [p.c2 * S + 70, ym]], (p.r2 - p.r1 + 1) * S - 12, LAYER.ground, 'plank');
  }

  // ---------- massive trunks: broad canopies centred on each trunk block ----------
  const TREES = { 'Seasons:tree_03': 0.82, 'Seasons:tree_08': 0.8, 'Seasons:tree_01': 0.86, 'Seasons:tree_alt_04': 0.86 };
  const treeSpecs = Object.keys(TREES);
  st.trunks.forEach((block, i) => {
    const mean = (f) => block.cells.reduce((a, cell) => a + f(cell), 0) / block.cells.length;
    // lean toward the block's own squares: nudge away from any non-trunk notch (the L-shaped block hugs a stair)
    const cx = mean((cell) => (cell.c - 0.5) * S) + rr(-14, 14), cy = mean((cell) => (cell.r - 0.5) * S) + rr(-14, 14);
    const spec = treeSpecs[i % treeSpecs.length];
    const tex = T(spec);
    const o = place(tex, cx - (block.cells.length === 3 ? 38 : 0), cy - (block.cells.length === 3 ? 38 : 0), { scale: TREES[spec], rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.canopy, casts: true });
    circles.push({ x: o.x, y: o.y, r: 200 });
  });

  // ---------- fallen logs across the height changes ----------
  for (const block of st.logs) {
    const cx = ((block.c1 - 1) * S + block.c2 * S) / 2 + rr(-10, 10), cy = ((block.r1 - 1) * S + block.r2 * S) / 2 + rr(-8, 8);
    place(T('Shops:log'), cx, cy, { scale: 0.92, rot: Math.PI / 2 + rr(-0.05, 0.05), layer: LAYER.prop, keep: true, casts: true });
    circles.push({ x: cx, y: cy, r: 250 });
  }

  // ---------- thorn hollow: dense bramble ----------
  {
    const t = st.thorns, x0 = (t.c1 - 1) * S, y0 = (t.r1 - 1) * S, x1 = t.c2 * S, y1 = t.r2 * S;
    const spines = fam('Dungeondraft', 'spines', { min: 100, max: 260 });
    for (const cell of t.cells) { // six brambles in every thorn square: dense, and the same in all four
      for (let i = 0; i < 6; i++) {
        place(pick(spines), (cell.c - 1) * S + rr(40, S - 40), (cell.r - 1) * S + rr(40, S - 40), { scale: rr(0.9, 1.15), rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.prop });
      }
    }
    for (let i = 0; i < 5; i++) { place(pick(fam('Dungeondraft', 'roots', { min: 230, max: 420 })), rr(x0 + 60, x1 - 60), rr(y0 + 60, y1 - 60), { scale: rr(0.85, 1.05), rot: rr(0, Math.PI * 2), layer: LAYER.clutter }); }
    rects.push({ x0: x0 - 20, y0: y0 - 20, x1: x1 + 20, y1: y1 + 20 });
  }

  // ---------- root stairs: gnarled roots creep over the flagstones' sides ----------
  const roots = fam('Dungeondraft', 'roots', { min: 230, max: 620 });
  for (const b of st.stairs) {
    const along = b.axis === 'x' ? b.x1 - b.x0 : b.y1 - b.y0, across = b.axis === 'x' ? b.y1 - b.y0 : b.x1 - b.x0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const u = rr(0.15, 0.85) * along, v = side * (across / 2 + rr(-40, 25));
        const x = b.axis === 'x' ? b.x0 + u : (b.x0 + b.x1) / 2 + v;
        const y = b.axis === 'x' ? (b.y0 + b.y1) / 2 + v : b.y0 + u;
        place(pick(roots), x, y, { px: rr(300, 420), rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.clutter });
      }
    }
  }

  // ---------- plank crossing: a few loose boards at the approaches ----------
  {
    const p = st.plank, xl = (p.c1 - 1) * S, xr = p.c2 * S;
    for (const [spec, x, y] of [['Above&Below:plank_a05:objects', xl - 40, (p.r1 - 1) * S + 40], ['Buildings:Broken_Plank_02:objects', xr + 40, p.r2 * S - 40], ['Above&Below:plank_b06:objects', xr + 70, (p.r1 - 1) * S - 30]]) {
      place(T(spec), x + rr(-20, 20), y + rr(-20, 20), { px: 200, rot: rr(0, Math.PI), layer: LAYER.clutter });
    }
  }

  // ---------- the guide's waypoint cache: the mole's pack, cloak, green cords, lantern ----------
  {
    const [cx, cy] = st.centre(st.cache);
    place(T('Interior:backpack_1a'), cx - 20 + rr(-6, 6), cy + 16, { scale: 1.0, rot: 0.4, layer: LAYER.prop });
    place(T('Shops:furcloak1_2'), cx + 42, cy - 30, { scale: 0.95, rot: -0.5, layer: LAYER.prop });
    place(T('Dungeondraft:rope_1a'), cx - 44, cy - 46, { scale: 0.8, rot: 1.0, layer: LAYER.prop });
    place(T('Modular:lantern_1a'), cx + 54, cy + 46, { scale: 0.9, rot: 0.3, layer: LAYER.prop });
    place(T('Buildings:Stick_Twig'), cx + 8, cy + 58, { scale: 0.9, rot: 1.9, layer: LAYER.clutter });
    circles.push({ x: cx, y: cy, r: 150 });
  }

  // ---------- the old charcoal hearth in the gully ----------
  {
    const x = 8.5 * S + rr(-20, 20), y = 11.3 * S + rr(-20, 20);
    place(T('Seasons:firepit_01a'), x, y, { scale: 0.95, rot: rr(0, 6.28), layer: LAYER.prop, casts: true });
    circles.push({ x, y, r: 190 });
  }

  // ---------- lichen-furred boundary stones ringing the clearing, and a pair flanking the forest exit ----------
  const STONES = ['Seasons:rock_stone_33', 'Seasons:rock_stone_28', 'Seasons:rock_stone_23', 'Seasons:rock_stonecold_27', 'Seasons:rock_stone_26'];
  const inWater = (x, y) => waterRects.some((q) => x > q.x0 - 60 && x < q.x1 + 60 && y > q.y0 - 60 && y < q.y1 + 60);
  const ringSpots = [[700, 70], [1900, 60], [3700, 70], [4460, 80], [5060, 2300], [5050, 3400], [5040, 3950], [900, 4030], [2000, 4040], [3300, 4030], [4400, 4040], [60, 700], [70, 1800], [60, 2700], [4990, 470], [4990, 1060]];
  for (const [x, y] of ringSpots) {
    if (inWater(x, y)) { continue; }
    const tex = T(pick(STONES));
    place(tex, x + rr(-24, 24), y + rr(-24, 24), { scale: rr(0.9, 1.15), rot: rr(0, Math.PI * 2), layer: LAYER.prop, keep: true, casts: true });
    place(T(`Seasons:terrain_grasspatch${1 + Math.floor(rng() * 3)}`), x + rr(-40, 40), y + rr(-40, 40), { scale: rr(0.9, 1.1), rot: rr(0, Math.PI * 2), layer: LAYER.clutter }); // lichen / moss around the foot
  }

  // ---------- hedge: dense undergrowth straddling the map edge (past the frame), open at the road and the exit ----------
  {
    const bushes = fam('Dungeondraft', 'bush', { min: 240, max: 540 });
    const gaps = { west: [2950, 3700], east: [380, 1150] };
    const edge = (side, along) => {
      const tex = pick(bushes), s = rr(0.95, 1.15), size = Math.max(tex.w, tex.h) * s;
      const out = size / 2 - rr(50, 100); // keeps the intrusion under 100 px
      if (side === 'north') { return [along, -out, tex, s]; }
      if (side === 'south') { return [along, H + out, tex, s]; }
      if (side === 'west') { return [-out, along, tex, s]; }
      return [W + out, along, tex, s];
    };
    for (const side of ['north', 'south', 'west', 'east']) {
      const length = side === 'north' || side === 'south' ? W : H;
      for (let a = rr(80, 200); a < length; a += rr(260, 420)) {
        if (gaps[side] && a > gaps[side][0] && a < gaps[side][1]) { continue; }
        if ((side === 'north' || side === 'south') && a > 2150 && a < 2950) { continue; } // the stream leaves the map here
        const [x, y, tex, s] = edge(side, a);
        place(tex, x, y, { scale: s, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.canopy });
      }
    }
  }

  // ---------- clutter (rule 3): ground detail everywhere, denser in the stream and thorns, along the cliff feet ----------
  const THEMES = {
    ground: [fam('Seasons', 'fern', { min: 120, max: 270, name: /[ab]$/ }), fam('Seasons', 'grass', { min: 100, max: 280, name: /a$/ }), fam('Elements', 'flower', { min: 80, max: 220 }), fam('Seasons', 'rock_stone', { min: 40, max: 170 }), fam('Seasons', 'rock_dirt', { min: 40, max: 170 }), fam('Buildings', 'stick_twig', { min: 40, max: 200 }), fam('Dungeondraft', 'roots', { min: 230, max: 310 }), fam('Seasons', 'terrain_grasspatch', { min: 150, max: 270 })],
    wet: [fam('Dungeondraft', 'reeds', { min: 190, max: 370 }), fam('Dungeondraft', 'reeds', { min: 190, max: 370 }), fam('Dungeondraft', 'reeds', { min: 190, max: 370 }), fam('Seasons', 'rock_stone', { min: 40, max: 130 })],
    cliffFoot: [fam('Seasons', 'rock_dirt', { min: 70, max: 190 }), fam('Seasons', 'rock_stone', { min: 70, max: 190 }), fam('Seasons', 'fern', { min: 120, max: 270, name: /[ab]$/ })],
  };
  for (const [name, families] of Object.entries(THEMES)) {
    if (families.some((f) => !f.length)) { throw new Error(`Clutter theme ${name} has an empty texture family`); }
  }
  /** Drop one piece of a theme at (x, y) if the spot is free. */
  function scatterOne(theme, x, y, { wet = false } = {}) {
    const tex = pick(pick(THEMES[theme]));
    const scale = rr(0.85, 1.15);
    const r = (Math.max(tex.w, tex.h) * scale) / 2 * 0.6;
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20) { return false; }
    if (!clear(x, y, r) || nearCliff(x, y, 70 + r * 0.4)) { return false; }
    if (!wet && inWater(x, y)) { return false; }
    place(tex, x, y, { scale, rot: rr(0, Math.PI * 2), mirror: rng() < 0.5, layer: LAYER.clutter });
    clutterObjects.push(objects[objects.length - 1]);
    circles.push({ x, y, r: r * 0.55 });
    return true;
  }
  function cluster(theme, cells, size, spread, opts) {
    const cell = pick(cells), cx = (cell.c - 0.5) * S + rr(-S / 2, S / 2), cy = (cell.r - 0.5) * S + rr(-S / 2, S / 2);
    let placed = 0;
    for (let i = 0; i < size * 6 && placed < size; i++) {
      if (scatterOne(theme, cx + rr(-spread, spread), cy + rr(-spread, spread), opts)) { placed++; }
    }
  }
  const skip = new Set(['stair', 'trunk', 'plank', 'thorn', 'cache', 'exit']);
  const dry = [...grid.cells.values()].filter((cell) => !skip.has(cell.kind) && cell.kind !== 'stream');
  const wetCells = st.poolsAndStream;
  for (let i = 0; i < 46; i++) { cluster('ground', dry, 1 + Math.floor(rng() * 4), rr(80, 190)); } // light, ordinary ground detail
  for (let i = 0; i < 36; i++) { cluster('ground', dry, 1, 40); }
  for (let i = 0; i < 60; i++) { cluster('wet', wetCells, 2 + Math.floor(rng() * 3), rr(70, 150), { wet: true }); } // difficult terrain: noticeably denser
  for (const run of st.cliffs) { // rocks and ferns gather at the foot and the lip of every cliff
    const lowSide = [-run.n[0], -run.n[1]], d = [run.vertical ? 0 : 1, run.vertical ? 1 : 0];
    const length = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
    for (let t = rr(60, 200); t < length; t += rr(160, 330)) {
      const side = rng() < 0.7 ? 1 : -1, off = rr(120, 175) * side;
      scatterOne('cliffFoot', run.a[0] + d[0] * t + lowSide[0] * off, run.a[1] + d[1] * t + lowSide[1] * off);
    }
  }
  // Apply the clutter cuts exactly (see the dockyard generator): remove a seeded share of what was placed.
  const CLUTTER_DENSITY = clutterCuts.reduce((density, cut) => density * (1 - cut), 1);
  const doomed = chooseRemovals(clutterObjects, CLUTTER_DENSITY, seededRandom((seed ^ 0x9e3779b1) | 0));
  const clutterKept = clutterObjects.length - doomed.size;
  for (let i = objects.length - 1; i >= 0; i--) { if (doomed.has(objects[i])) { objects.splice(i, 1); } }

  // ---------- shadows (Baileywiki BW pack): cliff sides and the biggest props ----------
  // Composed last from their own RNG so the layout above does not move. Neither is a placed prop: the circles are exempt from the
  // 0.8-1.2 scale range (rule 1), as in the user's own touch-ups, and sit below every other object.
  const shadowRng = seededRandom((seed ^ 0x5bd1e995) | 0);
  const sr = (a, b) => a + (b - a) * shadowRng();
  let cliffShadows = 0, propShadows = 0;
  for (const run of st.cliffs) {
    // The cliff strip's hard-edged shadow runs the cliff's own line the other way round: a half shadow fades to the LEFT of travel,
    // and the cliff path travels with the high ground on its left, so reversed it fades across the low ground. Its hard edge hides
    // under the cliff strip itself.
    mkPath(shadowPathSpec(CLIFF_SHADOW), [...run.path].reverse(), shadowPathWidth(CLIFF_SHADOW), LAYER.shadow, 'shadow');
    cliffShadows++;
  }
  for (const { o, size } of casters) {
    const tex = T(shadowCircleSpec(size >= BIG_PROP_PX ? '075' : '050'));
    const scale = clamp(size / 400, SHADOW_CIRCLE_SCALE, 2);
    objects.push({ pack: tex.pack, rel: tex.rel, name: tex.name, x: +(o.x + sr(-25, 25)).toFixed(1), y: +(o.y + sr(-25, 25)).toFixed(1), scale: +scale.toFixed(3), rot: 0, mirror: false, layer: LAYER.shadow });
    propShadows++;
  }

  return { world: { cols: COLS, rows: ROWS, size: S }, terrain, patterns: [], paths, objects, structure: st, stats: { clutter: clutterKept, clutterPlaced: clutterObjects.length, objects: objects.length, paths: paths.length, cliffShadows, propShadows } };
}
