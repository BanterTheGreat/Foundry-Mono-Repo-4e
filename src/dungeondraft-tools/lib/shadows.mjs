// The Baileywiki (BW) shadow pack: soft drop-shadow textures the user lays under walls, cliffs and big props.
// Shared by the map generators and verifiers so the texture names, strengths and the scale exemption live in one place.
// See the dungeondraft skill ("Shadows") for how the user uses them.
import { findTexture } from './packs.mjs';

/** Pack name (as indexed) and pack id (what a map's texture paths and manifest use). */
export const BW_PACK = '[BW] Baileywiki Shadows';
export const BW_PACK_ID = 'IFGltsLb';

/** Darkness of a shadow: the number in the texture name. 025 is a faint tint, 100 is solid black at its core. */
export const STRENGTHS = ['025', '050', '075', '100'];

/** Layer for shadows: below the ground clutter and every prop (`Below Water`), as the user lays them. */
export const SHADOW_LAYER = -100;

/**
 * Layer for shadow PATHS: below walls (which draw above layers 100-400) but above the other objects, so the shade falls on the
 * props it crosses too. Circle shadows stay on SHADOW_LAYER. Maps with props above 400 need a different value.
 */
export const SHADOW_PATH_LAYER = 400;

/** The user sets shadow circles at scale 1.3, outside the 0.8-1.2 prop range (mapping rule 1 does not apply to them). */
export const SHADOW_CIRCLE_SCALE = 1.3;

const assertStrength = (strength) => {
  if (!STRENGTHS.includes(strength)) {
    throw new Error(`Unknown BW shadow strength ${strength}; use one of ${STRENGTHS.join(', ')}`);
  }
};

/**
 * Texture spec for a shadow path.
 * - `edge: 'half'` is hard on one edge and fades out across the other; put its centreline on the wall or cliff line.
 *   The fade lies to the LEFT of the direction of travel on screen, so run the path away from the shaded side's wall.
 * - `edge: 'full'` fades on both sides, centred on the line.
 * - `size: 'large'` is a 512 px wide band (wide soft shadow), `'small'` is 256 px (a tight contact shadow).
 *
 * @param {{edge?: 'half'|'full', size?: 'large'|'small', strength?: string}} [options]
 * @returns {string} A `Pack:name:kind` spec for `findTexture`.
 */
export function shadowPathSpec({ edge = 'half', size = 'large', strength = '075' } = {}) {
  assertStrength(strength);
  const e = edge === 'full' ? 'Full' : 'Half';
  const s = size === 'small' ? 'Small' : 'Large';
  return `${BW_PACK}:BW_${e}_Shadow_${s}_${strength}:paths`;
}

/**
 * Texture spec for a circular shadow object (512 px, darkest at the centre) used under a big prop.
 *
 * @param {string} [strength] One of STRENGTHS.
 * @returns {string} A `Pack:name:kind` spec for `findTexture`.
 */
export function shadowCircleSpec(strength = '050') {
  assertStrength(strength);
  return `${BW_PACK}:BW_Shadow_Circle_${strength}:objects`;
}

/** The shadow path's `width`: the texture height, so the path renders at the texture's native thickness. */
export function shadowPathWidth(options) {
  return findTexture(shadowPathSpec(options)).h;
}

/** True when a `res://packs/...` path (or texture rel) belongs to the BW shadow pack. */
export function isShadowTexture(res) {
  return typeof res === 'string' && res.startsWith(`res://packs/${BW_PACK_ID}/`);
}
