// The checks every generated .dungeondraft_map must pass, whatever the encounter: structure against a real map of the same build,
// array sizes, asset paths and the pack manifest, colorable textures, the format-level mapping rules (1, 2, 4 and 6), BW shadow
// textures, and node ids. Each map's verify-dungeondraft-map.mjs adds what is specific to that map (its grid geometry, walls,
// terrain, clutter density and shadow placement), re-derived from the encounter on purpose and never from structure.mjs, so a
// mistake in the structure shows up as a mismatch.
//
// Every check takes `ok(condition, message)` first, from createChecker(), so a failure is counted and printed, not thrown.
import fs from 'node:fs';
import path from 'node:path';
import { loadRows } from './lib.mjs';
import { packs } from './packs.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, isShadowTexture } from './shadows.mjs';

/** Godot `Vector2( x, y )` string to [x, y]. */
export const vec = (s) => s.replace('Vector2', '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
/** Godot `PoolVector2Array( ... )` string to a list of [x, y]. */
export const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };
/** Number of elements in any Godot `Pool...Array( ... )` string. */
export const poolLen = (s) => s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').length;
/** Whether an object is a BW shadow circle rather than a prop. */
export const isShadowObject = (o) => isShadowTexture(o.texture);

/**
 * A pass/fail counter.
 * @returns {{ok: (condition: unknown, message: string) => void, summary: () => string, failed: () => number, finish: () => never}}
 *   `ok` records one check; `finish` prints the summary and exits 1 when anything failed.
 */
export function createChecker() {
  let passes = 0, fails = 0;
  const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('FAIL:', msg); } };
  const summary = () => `${passes} checks passed, ${fails} failed.`;
  return { ok, summary, failed: () => fails, finish: () => { console.log(summary()); process.exit(fails ? 1 : 0); } };
}

/** Load a map file as JSON. */
export const loadMap = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Split a level's objects into props (rule 1 applies) and BW shadow circles (exempt, with their own scale range). */
export function splitObjects(lv) {
  return { propObjects: lv.objects.filter((o) => !isShadowObject(o)), shadowObjects: lv.objects.filter(isShadowObject) };
}

function shape(v) {
  if (v === null) { return 'null'; }
  if (Array.isArray(v)) { return 'array'; }
  if (typeof v === 'string') { const m = v.match(/^(Vector2|Pool\w+Array|PoolIntArray)\(/); return m ? m[1] : /^[0-9a-f]{8}$/.test(v) ? 'color' : 'string'; }
  return typeof v;
}

/** Identical key sets and order, and the same value kinds, between one of our records and a real one. */
function compareKeys(ok, a, b, where, optional = []) {
  const ka = Object.keys(a).filter((k) => !optional.includes(k)), kb = Object.keys(b).filter((k) => !optional.includes(k));
  ok(JSON.stringify(ka) === JSON.stringify(kb), `${where}: keys differ\n   ours: ${ka}\n   real: ${kb}`);
  for (const k of ka) {
    if (k in b && !(shape(a[k]) === shape(b[k]) || shape(a[k]) === 'string' && shape(b[k]) === 'color' || shape(a[k]) === 'color' && shape(b[k]) === 'string' || shape(b[k]) === 'null' || shape(a[k]) === 'null')) {
      ok(false, `${where}.${k}: value kind ${shape(a[k])} vs real ${shape(b[k])}`);
    }
  }
}

/**
 * 1. Structure against a real map made by the same Dungeondraft build. Walls, portals, patterns, paths and objects are compared
 * only when the map has them (an outdoor map has no walls or patterns); the reference must then have one to compare with.
 * @param {Function} ok Counter from createChecker().
 * @param {object} map The generated map.
 * @param {object} ref A real map from the same Dungeondraft build.
 */
export function checkStructure(ok, map, ref) {
  const lv = map.world.levels['0'], rlv = ref.world.levels['0'];
  compareKeys(ok, map, ref, 'root', ['mod']);
  compareKeys(ok, map.header, ref.header, 'header');
  compareKeys(ok, map.header.creation_date, ref.header.creation_date, 'header.creation_date');
  compareKeys(ok, map.header.editor_state, ref.header.editor_state, 'editor_state');
  compareKeys(ok, map.world, ref.world, 'world');
  compareKeys(ok, lv, rlv, 'level');
  for (const k of ['environment', 'tiles', 'cave', 'terrain', 'roofs', 'water', 'shapes']) { compareKeys(ok, lv[k], rlv[k], `level.${k}`); }
  const against = (ours, theirs, where, optional) => {
    if (!ours) { return; }
    if (!theirs) { ok(false, `the reference map has no ${where} to compare with`); return; }
    compareKeys(ok, ours, theirs, where, optional);
  };
  const refWall = rlv.walls.find((w) => w.portals.length);
  for (const w of lv.walls) { against(w, refWall, `wall ${w.node_id}`); }
  against(lv.walls.flatMap((w) => w.portals)[0], refWall?.portals[0], 'portal');
  against(lv.patterns[0], rlv.patterns[0], 'pattern');
  against(lv.paths[0], rlv.paths[0], 'path');
  against(lv.objects[0], rlv.objects[0], 'object', ['custom_color']);
  ok(JSON.stringify(lv.layers) === JSON.stringify(rlv.layers), 'layers table differs from real map');
}

/**
 * 2. Array sizes follow the map size, and every terrain texel's four weights sum to 255.
 * @returns {{W: number, H: number, caveLen: number, splat: number[]}} The map size, the cave bitmap length and the terrain weights.
 */
export function checkArraySizes(ok, map) {
  const lv = map.world.levels['0'];
  const W = map.world.width, H = map.world.height;
  ok(poolLen(lv.tiles.cells) === W * H && lv.tiles.colors.length === W * H, 'tiles size');
  ok(poolLen(lv.terrain.splat) === 16 * W * H * 4, `splat size ${poolLen(lv.terrain.splat)} != ${16 * W * H * 4}`);
  const caveLen = Math.floor(2 * W * H + 1.5 * (W + H) + 2);
  ok(poolLen(lv.cave.bitmap) === caveLen && poolLen(lv.cave.entrance_bitmap) === caveLen, `cave bitmap size != ${caveLen}`);
  const splat = lv.terrain.splat.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number);
  let bad = 0;
  for (let i = 0; i < splat.length; i += 4) { if (splat[i] + splat[i + 1] + splat[i + 2] + splat[i + 3] !== 255) { bad++; } }
  ok(bad === 0, `${bad} splat texels do not sum to 255`);
  return { W, H, caveLen, splat };
}

/** 3. Every res:// path exists in the packs, and the manifest lists exactly the packs used. */
export function checkAssets(ok, map) {
  const lv = map.world.levels['0'];
  const { byId } = packs();
  const texts = [];
  (function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { Object.values(o).forEach(collect); } else if (typeof o === 'string' && o.startsWith('res://packs/')) { texts.push(o); } })(lv);
  const idsUsed = new Set(texts.map((t) => t.split('/')[3]));
  for (const t of new Set(texts)) { ok(byId.get(t.split('/')[3])?.entries.has(t), `missing asset ${t}`); }
  const manifestIds = new Set(map.header.asset_manifest.map((m) => m.id));
  for (const id of idsUsed) { ok(manifestIds.has(id), `pack ${id} used but not in manifest`); }
  for (const m of map.header.asset_manifest) { ok(JSON.stringify(byId.get(m.id)?.meta) === JSON.stringify(m), `manifest entry for ${m.name} differs from pack.json`); }
  ok([...manifestIds].every((id) => idsUsed.has(id)), 'manifest lists a pack that is not used');
}

/** Colorable textures are drawn as raw red unless tinted with custom_color. */
export function checkColorable(ok, map) {
  const lv = map.world.levels['0'];
  const { byId } = packs();
  const colorable = new Set(loadRows().filter((r) => r.colorable === 'y').map((r) => `${r.pack}|${r.rel}`));
  const idToName = new Map([...byId.values()].map((p) => [p.meta.id, p.name]));
  const key = (t) => `${idToName.get(t.split('/')[3])}|${t.split('/').slice(4).join('/')}`;
  const bad = lv.objects.filter((o) => !o.custom_color && colorable.has(key(o.texture)));
  ok(bad.length === 0, `${bad.length} colorable textures placed without custom_color (they render raw red): ${bad.slice(0, 3).map((o) => o.texture.split('/').pop())}`);
}

/**
 * The format-level mapping rules: 1 (prop scale 0.8 to 1.2; shadow circles are exempt), 2 (object shadows off), 4 (nothing snapped
 * to a square centre with no rotation) and 6 (the cave and building tools stay empty).
 * @param {number} S Square size in px.
 * @param {number} caveLen Expected cave bitmap length, from checkArraySizes().
 */
export function checkMappingRules(ok, map, { S, caveLen }) {
  const lv = map.world.levels['0'];
  const { propObjects } = splitObjects(lv);
  const scales = propObjects.map((o) => vec(o.scale));
  ok(scales.every(([sx, sy]) => sx === sy && sx >= 0.8 - 1e-9 && sx <= 1.2 + 1e-9), `rule 1: ${scales.filter(([sx]) => sx < 0.8 || sx > 1.2).length} objects have a scale outside 0.8-1.2`);
  ok(map.world.object_shadow === false && lv.objects.every((o) => o.shadow === false), 'rule 2: object shadows must be off (world.object_shadow and every object.shadow)');
  // a square's centre is half a square past a grid line: x = S/2 (mod S). The generators' own copies of this test measured the
  // distance to the grid lines instead, so they could never flag a snapped prop.
  const fromCentre = (v) => Math.abs((((v % S) + S) % S) - S / 2);
  const snapped = lv.objects.filter((o) => { const [x, y] = vec(o.position); return fromCentre(x) < 0.5 && fromCentre(y) < 0.5 && Math.abs(o.rotation) < 1e-3; }).length;
  ok(snapped === 0, `rule 4: ${snapped} objects sit exactly on a square centre with no rotation`);
  ok(poolLen(lv.cave.bitmap) === caveLen && !/[1-9]/.test(lv.cave.bitmap.replace(/^Pool\w+\(/, '')) && !/[1-9]/.test(lv.cave.entrance_bitmap.replace(/^Pool\w+\(/, '')), 'rule 6: cave tool data must stay empty');
  ok(lv.shapes.polygons.length === 0 && lv.shapes.walls.length === 0, 'rule 6: building tool shapes must stay empty');
}

/**
 * The BW shadow textures: shadow paths are BW Half or Full shadows on one layer, shadow circles are the plain (not colorable) BW
 * circle on the shadow layer at scale 1.3 to 2. Where each shadow goes is map-specific and stays in the map's verifier.
 * @param {number} pathLayer Layer the map's shadow paths belong on (`SHADOW_PATH_LAYER`, or `SHADOW_LAYER` on an older map).
 * @param {boolean} [onlyShadowPaths] Whether every path on the map must be a shadow path.
 * @returns {{shadowPaths: object[], shadowObjects: object[]}}
 */
export function checkShadowTextures(ok, map, { pathLayer, onlyShadowPaths = true }) {
  const lv = map.world.levels['0'];
  const shadowPaths = lv.paths.filter((p) => isShadowTexture(p.texture));
  const { shadowObjects } = splitObjects(lv);
  if (onlyShadowPaths) { ok(shadowPaths.length === lv.paths.length && shadowPaths.length > 0, 'every path must be a BW shadow path (this map has no other paths)'); }
  ok(shadowPaths.every((p) => p.layer === pathLayer && /[/]BW_(Half|Full)_Shadow_(Large|Small)_(025|050|075|100)[.]png$/.test(p.texture)), `shadow paths must be BW shadow textures on layer ${pathLayer}`);
  ok(shadowObjects.every((o) => o.layer === SHADOW_LAYER && /[/]objects[/]BW_Shadow_Circle_(025|050|075|100)[.]png$/.test(o.texture)), 'shadow circles must be BW circle shadows (not colorable) on the shadow layer');
  const circleScales = shadowObjects.map((o) => vec(o.scale));
  ok(circleScales.every(([sx, sy]) => sx === sy && sx >= SHADOW_CIRCLE_SCALE - 1e-9 && sx <= 2 + 1e-9), `shadow circles must be scaled ${SHADOW_CIRCLE_SCALE}-2`);
  return { shadowPaths, shadowObjects };
}

/**
 * 6. Node ids are unique, `next_node_id` is past the largest, and no object sits far outside the map.
 * @param {number} S Square size in px.
 * @param {number} margin How far past the map edge an object may sit, in px.
 */
export function checkNodes(ok, map, { S, margin }) {
  const lv = map.world.levels['0'];
  const W = map.world.width, H = map.world.height;
  const ids = [];
  (function collect(o) { if (Array.isArray(o)) { o.forEach(collect); } else if (o && typeof o === 'object') { if (typeof o.node_id === 'string') { ids.push(o.node_id); } Object.values(o).forEach(collect); } })(lv);
  ok(new Set(ids).size === ids.length, 'duplicate node_id values');
  ok(parseInt(map.world.next_node_id, 16) > Math.max(...ids.map((x) => parseInt(x, 16))), 'next_node_id not beyond the largest node id');
  ok(lv.objects.every((o) => { const [x, y] = vec(o.position); return x > -margin && y > -margin && x < W * S + margin && y < H * S + margin; }), 'object far outside the map');
}

/** Absolute path of a file next to a map, for the entry scripts' defaults. */
export const mapFileIn = (dir, encounter, stem = encounter) => path.join(dir, encounter, `${stem}.dungeondraft_map`);
