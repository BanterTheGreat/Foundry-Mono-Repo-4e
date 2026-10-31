// Helpers the map generators' scene.mjs files share: the scale range, the clutter calibration, object and record builders, the
// circular prop shadows, and the sanity checks every scene runs while composing. What a map contains stays in its own scene.mjs.
//
// Seeded randomness is order-sensitive: a scene's layout depends on every draw from its RNG, so nothing here draws from the
// scene's own stream except `randomHelpers`, which wraps it without consuming anything, and `circleShadows`, which has its own
// stream. Moving code in here must never change how many draws a scene makes or in what order.
import { chooseRemovals, seededRandom } from './geometry.mjs';
import { familyMembers } from './packs.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, shadowCircleSpec, shadowPathSpec, shadowPathWidth } from './shadows.mjs';

/** Rule 1: every placed prop is scaled within this range (the BW shadow circles are exempt). */
export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.2;

/**
 * The clutter calibration for every map: compounding cuts requested by the user so far (each 0.15 = 15% less than the level
 * before). "Another -15%" means appending 0.15 here, which applies to every generator at once.
 */
export const CLUTTER_CUTS = [0.15, 0.15];

/**
 * Crate and barrel textures for cargo stacks: `base` is the bottom tier, `mid` the middle tier, `top` the loose top pieces.
 * Shared by the dockyard stacks and the safehouse store.
 */
export const CRATE_SPECS = {
  base: ['Buildings:Crate_Large_02:objects', 'Above&Below:crate_03a:objects', 'Buildings:Crate_03:objects', 'Above&Below:cloth_crate_02:objects', 'Buildings:Crate_01:objects', 'Buildings:Crate_Large_01:objects'],
  mid: ['Buildings:Crate_01:objects', 'Buildings:Crate_Large_02:objects', 'Buildings:Barrel_Simple_Wooden_01:objects', 'Buildings:Barrel_Closed:objects', 'Above&Below:cloth_crate_02:objects', 'Buildings:Crate_03:objects', 'Above&Below:crate_03a:objects'],
  top: ['Buildings:Crate_Cloth_Covered_01:objects', 'Buildings:Barrel_Small_Closed:objects', 'Buildings:Sack_Pile_02:objects', 'Buildings:Sack_Tied_Upright_01:objects', 'Above&Below:cloth_crate_01:objects'],
};

/** Wall-mounted lanterns, drawn with their mounting edge at the top. */
export const WALL_LAMPS = ['Buildings:Lantern_Wall_01:objects', 'Buildings:Lantern_Wall_02:objects'];

/** Clamp `v` into `[a, b]`. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * `rr` (a random number in [a, b)) and `pick` (a random list element) drawing from a scene's own RNG.
 * @param {() => number} rng The scene's seeded generator.
 */
export function randomHelpers(rng) {
  return {
    rr: (a, b) => a + (b - a) * rng(),
    pick: (list) => list[Math.floor(rng() * list.length)],
  };
}

/**
 * A texture-family lister for ground clutter: non-colorable members whose longest side is within bounds.
 * @param {number} [defaultMax] Longest side allowed when a call gives no `max` (200 for indoor-sized detail, 400 outdoors).
 * @returns {(pack: string, family: string, options?: {min?: number, max?: number, name?: RegExp}) => object[]}
 */
export function makeFam(defaultMax = 200) {
  return (pack, family, { min = 30, max = defaultMax, name } = {}) => familyMembers(pack, family).filter((m) => !m.colorable && Math.max(m.w, m.h) >= min && Math.max(m.w, m.h) <= max && (!name || name.test(m.name)));
}

/**
 * Throw when a clutter theme has an empty texture family, which would crash a pick much later.
 * @param {Record<string, object[][]>} themes Theme name to its list of families.
 */
export function assertThemes(themes) {
  for (const [name, families] of Object.entries(themes)) {
    if (families.some((f) => !f.length)) { throw new Error(`Clutter theme ${name} has an empty texture family`); }
  }
}

/**
 * Build one scene object, enforcing rule 1 and refusing colorable textures. `scale` is used as given; `px` asks for a size and is
 * clamped into the allowed range.
 * @param {{pack: string, rel: string, name: string, w: number, h: number, colorable?: boolean}} tex The texture.
 * @param {number} x World x in px.
 * @param {number} y World y in px.
 * @param {{scale?: number, px?: number, rot?: number, mirror?: boolean, layer: number}} options
 * @returns {{object: object, radius: number}} The scene record, and half the placed footprint's longest side (px) for keep-outs.
 */
export function buildObject(tex, x, y, { scale, px, rot = 0, mirror = false, layer }) {
  if (tex.colorable) { throw new Error(`${tex.name} is a colorable texture: placed untinted it renders raw red`); }
  const s = scale ?? clamp(px / Math.max(tex.w, tex.h), SCALE_MIN, SCALE_MAX);
  if (s < SCALE_MIN - 1e-9 || s > SCALE_MAX + 1e-9) { throw new Error(`Rule 1: ${tex.name} scale ${s.toFixed(3)} is outside ${SCALE_MIN}-${SCALE_MAX}`); }
  const object = { pack: tex.pack, rel: tex.rel, name: tex.name, x: +x.toFixed(1), y: +y.toFixed(1), scale: +s.toFixed(3), rot: +rot.toFixed(4), mirror, layer };
  return { object, radius: (Math.max(tex.w, tex.h) * s) / 2 };
}

/**
 * Apply the clutter cuts exactly. Scaling the placement attempts instead missed the target (a -15% cut left one map with the same
 * count) because rejected attempts place nothing, and thinning the layout while generating it would shift every later draw. So
 * remove a seeded share of what was placed: the result is exactly round(placed * density), a deeper cut always removes a
 * superset of what a shallower cut removed, and nothing else in the map moves.
 * @param {object[]} objects The scene's objects; the removed ones are taken out in place.
 * @param {object[]} clutterObjects The ground-clutter entries of `objects`.
 * @param {number} seed The scene seed.
 * @param {number[]} cuts Compounding cuts, e.g. {@link CLUTTER_CUTS}.
 * @returns {number} How many clutter objects remain.
 */
export function applyClutterCuts(objects, clutterObjects, seed, cuts) {
  const density = cuts.reduce((d, cut) => d * (1 - cut), 1);
  const doomed = chooseRemovals(clutterObjects, density, seededRandom((seed ^ 0x9e3779b1) | 0));
  for (let i = objects.length - 1; i >= 0; i--) { if (doomed.has(objects[i])) { objects.splice(i, 1); } }
  return clutterObjects.length - doomed.size;
}

/** A scene pattern record. */
export const patternRecord = (tex, points, layer) => ({ pack: tex.pack, rel: tex.rel, name: tex.name, points, layer });

/** A scene path record (cliffs, stairs, planks, shadows): `width` is the rendered thickness in px. */
export const pathRecord = (tex, points, width, layer, role) => ({ pack: tex.pack, rel: tex.rel, name: tex.name, points, width, layer, role });

/**
 * A BW shadow path record. A half shadow fades to the left of travel, so run `points` with the open or low side on the left.
 * @param {(spec: string) => object} T Texture lookup (`findTexture`).
 * @param {object} options Shadow options for {@link shadowPathSpec} (`edge`, `size`, `strength`).
 * @param {number} layer `SHADOW_PATH_LAYER` for a path above the props, or `SHADOW_LAYER` on an older map.
 */
export function shadowPathRecord(T, options, points, layer, role = 'shadow') {
  return pathRecord(T(shadowPathSpec(options)), points, shadowPathWidth(options), layer, role);
}

/**
 * A wall record: `tex` is the wall texture, `wall` is `{id?, loop, points, openings: [[x, y], ...]}` and `door` the portal texture.
 * Every opening is an open door; the wall's thickness is the texture height.
 */
export function wallRecord(tex, { id, loop, points, openings }, door) {
  return {
    ...(id === undefined ? {} : { id }),
    pack: tex.pack, rel: tex.rel, name: tex.name, thickness: tex.h, loop, points,
    openings: openings.map(([x, y]) => ({ x, y, pack: door.pack, rel: door.rel, closed: false })),
  };
}

/**
 * Where a wall-dressing prop goes: `back` px in from the outer wall edge of band cell `cell`, shifted `along` px along the wall.
 * @param {number} S Square size in px.
 * @param {{out: number[], c: number, r: number}} cell A wall-band cell: its outward unit normal and its square.
 */
export function onWall(S, { out, c, r }, back, along) {
  const x = (c - 0.5) * S, y = (r - 0.5) * S;
  return [x + out[0] * (S / 2 - back) - out[1] * along, y + out[1] * (S / 2 - back) + out[0] * along];
}

/**
 * The circular BW shadows under the biggest props. They are objects on the shadow layer (below everything else), exempt from the
 * 0.8-1.2 scale range, and composed from their own seeded stream so adding or retuning them never moves the rest of a layout.
 * @param {{x: number, y: number, size: number, strength: string}[]} casters Props that cast one: centre, longest side in px, '025'-'100'.
 * @param {object} options
 * @param {number} options.seed The scene seed.
 * @param {number} options.sizePerScale Prop size in px that earns scale 1 (400 for most maps, 520 for the safehouse's big stacks).
 * @param {(spec: string) => object} options.T Texture lookup (`findTexture`).
 * @returns {{object: object, radius: number}[]} Scene object records, in caster order, with each circle's radius in px.
 */
export function circleShadows(casters, { seed, sizePerScale, T }) {
  const shadowRng = seededRandom((seed ^ 0x5bd1e995) | 0);
  const sr = (a, b) => a + (b - a) * shadowRng();
  return casters.map(({ x, y, size, strength }) => {
    const tex = T(shadowCircleSpec(strength));
    const scale = clamp(size / sizePerScale, SHADOW_CIRCLE_SCALE, 2);
    const cx = x + sr(-25, 25), cy = y + sr(-25, 25);
    return {
      object: { pack: tex.pack, rel: tex.rel, name: tex.name, x: +cx.toFixed(1), y: +cy.toFixed(1), scale: +scale.toFixed(3), rot: 0, mirror: false, layer: SHADOW_LAYER },
      radius: (tex.w * scale) / 2,
      centre: [cx, cy],
    };
  });
}
