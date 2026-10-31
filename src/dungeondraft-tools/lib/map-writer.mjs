// Serialises a composed scene to a native Dungeondraft map (format 3, matching build 1.2.0.1 "opulent kirin").
// Each map's scene.mjs composes everything from its encounter grid under the user's mapping rules; this file only serialises it,
// so a format fix is made once for every map.
//
// Format notes (verified against the user's 97 maps and the Dungeondraft assembly; see the dungeondraft skill):
//  - world units are px at 256 px per grid square; Godot types are strings: "Vector2( x, y )", "PoolVector2Array( ... )".
//  - terrain.splat = RGBA8 weights per 64-px texel (4x4 texels per square), row-major, one weight per terrain slot.
//  - wall.joint is Godot Line2D joint mode: 0 sharp, 1 bevel, 2 round.
//  - portal.wall_distance = index of the wall segment + fraction along that segment; point_index = segment index.
//  - path.edit_points are relative to position; width is the texture's rendered height in px.
//  - cave.bitmap / entrance_bitmap = floor(2wh + 1.5(w+h) + 2) zero bytes.
import fs from 'node:fs';
import path from 'node:path';
import { locateOnPolyline } from './geometry.mjs';
import { packs, resPath } from './packs.mjs';

const BUILT_IN_TERRAIN = ['res://textures/terrain/terrain_dirt.png', 'res://textures/terrain/terrain_gravel.png', 'res://textures/terrain/terrain_sand.png', 'res://textures/terrain/terrain_snow.png'];
const PALETTE = ['ff6b3834', 'ffac584c', 'ff885848', 'ffc0866c', 'ff8d6d58', 'fff3a768', 'ff685848', 'ff9c8868', 'ffae9254', 'ffd8c888', 'ff888868', 'ffaab478', 'ff92aa58', 'ff87a868', 'ff679865', 'ff789868', 'ff546d56', 'ff68887c', 'ff667878', 'ff809dab', 'ff61788d', 'ff535869', 'ff786878', 'ff886878', 'ff905868', 'ff994858', 'ffd8d8d8', 'ff8a8a8a', 'ff585858', 'ff282828'];

// ---------- Godot value formatting ----------
const n = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(5)));
const vec = (x, y) => `Vector2( ${n(x)}, ${n(y)} )`;
const poolVec = (pts) => `PoolVector2Array( ${pts.map(([x, y]) => `${n(x)}, ${n(y)}`).join(', ')} )`;
const poolBytes = (bytes) => `PoolByteArray( ${bytes.join(', ')} )`;

/**
 * Serialise a scene to a Dungeondraft map object.
 *
 * The scene is `{ world: {cols, rows, size}, terrain: {textures}, patterns?, walls?, paths, objects }`; `patterns` and `walls`
 * may be absent for an outdoor map. Every texture reference is `{pack, rel}` and is checked against the packs.
 *
 * @param {object} scene The composed scene.
 * @param {object} options
 * @param {number} options.seed Seed recorded in the map's `msi` block.
 * @param {number[]} options.splat Terrain weights: RGBA8 per 64-px texel, row-major (`cols * 4 * rows * 4 * 4` bytes).
 * @param {number} options.cameraZoom Editor camera zoom the map opens at.
 * @param {Date} [options.now] Creation time written to the header (injectable for reproducible output).
 * @returns {{map: object, usedPacks: Set<string>, counts: {patterns: number, walls: number, portals: number, paths: number, objects: number}}}
 */
export function serialiseMap(scene, { seed, splat, cameraZoom, now = new Date() }) {
  const { cols: COLS, rows: ROWS, size: S } = scene.world;
  const usedPacks = new Set();
  /** res:// path for a texture reference ({pack, rel}), verified to exist; remembers the pack for the manifest. */
  const res = (t) => { usedPacks.add(t.pack); return resPath(t.pack, t.rel); };
  let nextId = 1;
  const nodeId = () => (nextId++).toString(16);

  const patterns = (scene.patterns ?? []).map((p) => ({
    position: vec(0, 0),
    shape_rotation: 0,
    scale: vec(1, 1),
    points: poolVec(p.points),
    layer: p.layer,
    color: 'ffffffff',
    outline: false,
    texture: res(p),
    rotation: 0,
    node_id: nodeId(),
  }));

  const walls = (scene.walls ?? []).map((w) => {
    const id = nodeId();
    const portals = w.openings.map((o) => {
      const at = locateOnPolyline(w.points, w.loop, o.x, o.y);
      if (!at || at.dist > 1) { throw new Error(`Opening (${o.x}, ${o.y}) is not on ${w.id === undefined ? 'its wall' : `wall ${w.id}`}`); }
      return { at, o };
    }).sort((a, b) => a.at.index + a.at.t - (b.at.index + b.at.t)).map(({ at, o }) => ({
      position: vec(o.x, o.y),
      rotation: +Math.atan2(at.direction[1], at.direction[0]).toFixed(6),
      scale: vec(1, 1),
      direction: vec(at.direction[0], at.direction[1]),
      texture: res(o),
      radius: S / 2,
      point_index: at.index,
      wall_id: id,
      wall_distance: +(at.index + at.t).toFixed(6),
      closed: o.closed,
      node_id: nodeId(),
    }));
    return { points: poolVec(w.points), texture: res(w), color: 'ffffffff', loop: w.loop, type: 1, joint: 0, normalize_uv: true, shadow: false, node_id: id, portals };
  });

  const paths = scene.paths.map((p) => {
    const [ox, oy] = p.points[0];
    return {
      position: vec(ox, oy),
      rotation: 0,
      scale: vec(1, 1),
      edit_points: poolVec(p.points.map(([x, y]) => [+(x - ox).toFixed(2), +(y - oy).toFixed(2)])),
      smoothness: p.points.length > 2 ? 1 : 0, // a two-point path follows its line exactly
      texture: res(p),
      width: p.width,
      layer: p.layer,
      fade_in: false,
      fade_out: false,
      grow: false,
      shrink: false,
      block_light: false,
      loop: false,
      node_id: nodeId(),
    };
  });

  const terrain = {
    enabled: true,
    expand_slots: false,
    smooth_blending: false,
    texture_1: scene.terrain.textures[0] ? res(scene.terrain.textures[0]) : BUILT_IN_TERRAIN[0],
    texture_2: scene.terrain.textures[1] ? res(scene.terrain.textures[1]) : BUILT_IN_TERRAIN[1],
    texture_3: scene.terrain.textures[2] ? res(scene.terrain.textures[2]) : BUILT_IN_TERRAIN[2],
    texture_4: scene.terrain.textures[3] ? res(scene.terrain.textures[3]) : BUILT_IN_TERRAIN[3],
    splat: poolBytes(splat),
  };

  // rule 2: no object shadows
  const objects = scene.objects.map((o) => ({
    position: vec(o.x, o.y),
    rotation: o.rot,
    scale: vec(o.scale, o.scale),
    mirror: o.mirror,
    texture: res(o),
    layer: o.layer,
    shadow: false,
    block_light: false,
    node_id: nodeId(),
  }));

  const zeros = (len) => poolBytes(new Array(len).fill(0)); // rule 6: no cave data
  const caveLen = Math.floor(2 * COLS * ROWS + 1.5 * (COLS + ROWS) + 2);
  const W = COLS * S, H = ROWS * S;
  const level = {
    label: 'Ground',
    environment: { baked_lighting: true, ambient_light: 'ffffffff' },
    layers: { 100: 'User Layer 1', 200: 'User Layer 2', 300: 'User Layer 3', 400: 'User Layer 4', 700: 'Above Walls', 900: 'Above Roofs', 1100: 'Above Lights', '-400': 'Below Ground', '-100': 'Below Water' },
    shapes: { polygons: [], walls: [] }, // rule 6: no building tool
    tiles: { cells: `PoolIntArray( ${new Array(COLS * ROWS).fill(-1).join(', ')} )`, colors: new Array(COLS * ROWS).fill('ffffffff'), lookup: {} },
    patterns,
    walls,
    portals: [],
    cave: { bitmap: zeros(caveLen), ground_color: 'ff7f7e71', wall_color: 'ff7f7e71', entrance_bitmap: zeros(caveLen), texture: 'res://textures/caves/colorable/floor.png' },
    terrain,
    water: { disable_border: false },
    materials: {},
    paths,
    objects,
    lights: [],
    roofs: { shade: true, shade_contrast: 0.5, sun_direction: 45, roofs: [] },
    texts: [],
    texts_vis: true,
  };
  const map = {
    header: {
      creation_build: '1.2.0.1 opulent kirin',
      creation_date: { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), weekday: now.getDay(), dst: false, hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() },
      uses_default_assets: false,
      asset_manifest: [...usedPacks].sort().map((name) => packs().byName.get(name).meta),
      editor_state: {
        current_level: 0,
        camera_position: vec(W / 2, H / 2),
        camera_zoom: cameraZoom,
        guide_position: 'null',
        trace_image: null,
        color_palettes: {
          object_custom_colors: PALETTE,
          scatter_custom_colors: PALETTE,
          light_colors: ['ffeccd8b', 'ffeaefca', 'ff80beff', 'ffffad58', 'ff4dd569'],
          grid_colors: ['7fffffff', '7fcccccc', '7f333333', '7f000000'],
          deep_water_colors: ['ff3aa19a', 'ff8bceb0', 'ffffcc55', 'ff3c8ab8'],
          shallow_water_colors: ['ff3ac3b2', 'ff8bceb0', 'ffcc5555', 'ff54c1da'],
          cave_ground_colors: ['ff7f7e71'],
          cave_wall_colors: ['ff7f7e71'],
        },
        object_tags_memory: { set: 0, tags: [] },
        scatter_tags_memory: { set: 0, tags: [] },
        object_library_memory: { mode: 'all', scroll: 0, selected: [], search_strictness: 0.5 },
        scatter_library_memory: null,
        path_library_memory: { scroll: 0, selected: [], search_strictness: 0.5 },
        sharpen_fonts: true,
      },
    },
    world: {
      format: 3,
      width: COLS,
      height: ROWS,
      next_node_id: nextId.toString(16),
      next_prefab_id: '0',
      msi: { offset_map_size: 512, max_offset_distance: 0.2, cell_size: 64, seed: (seed >>> 0).toString(16).padStart(8, '0') },
      grid: { color: '7f000000', texture: 'res://textures/grid/dotted_line.png' },
      building_wear: null,
      wall_shadow: false,
      object_shadow: false, // rule 2
      trace_image_visible: false,
      embedded: {},
      levels: { 0: level },
    },
  };
  const portalCount = walls.reduce((a, w) => a + w.portals.length, 0);
  return { map, usedPacks, counts: { patterns: patterns.length, walls: walls.length, portals: portalCount, paths: paths.length, objects: objects.length } };
}

/**
 * Write a map object to `<out>/<name>.dungeondraft_map` (tab-indented JSON, like Dungeondraft itself).
 * @param {object} map The map from {@link serialiseMap}.
 * @param {string} out Output folder, created when missing.
 * @param {string} name File stem.
 * @returns {string} The file written.
 */
export function writeMapFile(map, out, name) {
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${name}.dungeondraft_map`);
  fs.writeFileSync(file, JSON.stringify(map, null, '\t') + '\n');
  return file;
}

/**
 * One-line summary of what was written, for the entry scripts' console output.
 * @param {{counts: object, usedPacks: Set<string>}} built Result of {@link serialiseMap}.
 * @param {{clutter: number}} stats The scene's `stats`.
 * @returns {string}
 */
export function describeMap({ counts, usedPacks }, stats) {
  const parts = [];
  if (counts.patterns) { parts.push(`${counts.patterns} patterns`); }
  if (counts.walls) { parts.push(`${counts.walls} walls (${counts.portals} portals)`); }
  parts.push(`${counts.paths} paths`, `${counts.objects} objects (${stats.clutter} clutter)`);
  return `${parts.join(', ')}; packs: ${[...usedPacks].sort().join(', ')}`;
}
