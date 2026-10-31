# .dungeondraft_map format

Verified against the user's 97 maps (builds 0.9.4 format 2; 1.0.x, 1.1.0.5 and 1.2.0.1 format 3) and the Dungeondraft assembly. Target the newest build in the library (1.2.0.1 "opulent kirin") and use a real map of that build as the structural reference, e.g. `Documents\DungeonDraft Maps\Zeitgeist\Book 5\Subway.dungeondraft_map`. A generator that matches a real map's keys, key order and value kinds loads; compare before trusting a hand-written file.

## File and units

- Tab-indented JSON ending in a newline. Root keys: `header`, `world`, and optionally `mod` (runtime state of the user's Dungeondraft mods; omit it).
- World units are pixels, **256 px per grid square**, origin top-left, y down. `world.width`/`height` count squares. Rotation is radians, positive clockwise on screen (a portal on a wall heading up has rotation `atan2(dy, dx)` = -1.5708).
- Godot values are strings: `Vector2( 1408, 896 )`, `PoolVector2Array( x, y, x, y )`, `PoolIntArray( ... )`, `PoolByteArray( ... )`, colors as 8 hex digits `aarrggbb`. Unset is `null` or the string `"null"` (`guide_position`).

## header

`creation_build`, `creation_date` (year, month, day, weekday, dst, hour, minute, second), `uses_default_assets` (false when any pack is used), `asset_manifest`, `editor_state`.

- `asset_manifest` entries are verbatim copies of each used pack's `pack.json` (name, id, version, author, keywords, allow_3rd_party_mapping_software_to_read, custom_color_overrides; some packs lack `keywords`). List exactly the packs the map references.
- `editor_state` can be minimal: `current_level`, `camera_position`, `camera_zoom` (larger zooms out; ~3.2 frames an 18x14 map), `guide_position`, `trace_image` (null), `color_palettes`, `object_tags_memory`, `scatter_tags_memory`, `object_library_memory`, `scatter_library_memory` (null), `path_library_memory`, `sharpen_fonts`. Copy the palettes from the reference map. Do not copy the user's trace image or library memory.

## world

Keys in order: `format` (3), `width`, `height`, `next_node_id` (hex string beyond the largest node id), `next_prefab_id` ("0"), `msi` (`offset_map_size` 512, `max_offset_distance` 0.2, `cell_size` 64, `seed` hex), `grid` (`color`, `texture` `res://textures/grid/dotted_line.png`), `building_wear` (null), `wall_shadow`, `object_shadow`, `trace_image_visible`, `embedded` ({}), `levels`.

The user's recent maps keep `wall_shadow` and `object_shadow` false and every object's `shadow` false. Shadows are one toggle each; how the world flags interact with per-object `shadow` is unverified.

## levels["0"]

Keys in order: `label` ("Ground"), `environment` (`baked_lighting` true, `ambient_light` "ffffffff"), `layers`, `shapes` (`polygons`, `walls`, both []), `tiles`, `patterns`, `walls`, `portals` ([]; real portals live inside their wall), `cave`, `terrain`, `water`, `materials` ({}), `paths`, `objects`, `lights`, `roofs`, `texts`, `texts_vis` (true).

- `layers`: `100/200/300/400` User Layers 1-4, `700` Above Walls, `900` Above Roofs, `1100` Above Lights, `-400` Below Ground, `-100` Below Water. Walls draw above layers 100-400, so props that overlap a wall (a dock ladder over a coping wall) need layer 700; the user's maps use 100 and 700. Patterns normally use 100; use higher layers to stack floors over paving.
- `tiles`: `cells` = `PoolIntArray` of `w*h` entries (-1 = no tile), `colors` = `w*h` copies of "ffffffff", `lookup` {}.
- `cave`: `bitmap` and `entrance_bitmap` = `PoolByteArray` of `floor(2wh + 1.5(w+h) + 2)` zeros (fits all 25 distinct sizes in the library), `ground_color`/`wall_color` "ff7f7e71", `texture` `res://textures/caves/colorable/floor.png`.
- `water`: `{ "disable_border": false }`. Some maps carry a `tree`, written by the water tool; the user paints water with a terrain texture instead.
- `roofs`: `shade` true, `shade_contrast` 0.5, `sun_direction` 45, `roofs` []. `lights`, `paths`, `texts`: [] unless needed.

## Entities (key order matters when matching a real map)

**pattern** (floor polygon): `position`, `shape_rotation`, `scale`, `points`, `layer`, `color`, `outline`, `texture`, `rotation`, `node_id`. Use `position` (0,0) and absolute `points` so every polygon shares one texture lattice. Patterns are tiled 1:1 at scale 1 (the user sometimes sets scale > 1.2 for taste). A polygon with a hole is one ring plus a bridging slit (seen in the user's `Warehouse` map). The generator splits regions into disjoint rectangles instead (greedy scanline merge); adjacent same-texture patterns are expected to union seamlessly.

**wall**: `points`, `texture`, `color`, `loop`, `type`, `joint`, `normalize_uv`, `shadow`, `node_id`, `portals`.
- Thickness is the texture's height, centred on the polyline. A 254 px wall (Scenes `thickwall`) centred on cell-centre lines fills those squares exactly.
- `joint` is Godot `Line2D` joint mode: 0 sharp (square corners), 1 bevel, 2 round. `type` 0 occurs only in builds up to 1.0.1.3 (a legacy value); every wall from 1.0.2.1 on, 1.2.0.1 included, is `type` 1. Use 1.
- A closed rectangle is one wall with `loop: true` and four points. Pack `_end` sprites exist for open ends; that Dungeondraft draws them automatically is expected but unverified.

**portal** (inside `wall.portals`): `position` (on the wall line), `rotation` (= `atan2(direction)`), `scale`, `direction` (unit vector along the segment, in point order), `texture` (`textures/portals/*`), `radius` (half the sprite width, 128 for 256 px), `point_index`, `wall_id` (the wall's `node_id`), `wall_distance`, `closed`, `node_id`.
- `wall_distance` = **segment index + fraction along that segment** (segment i runs from point i to point i+1, a loop's closing segment is the last index). Checked on 903 portals, loops included, no mismatches; `point_index` equals the segment index.
- Portals cut an opening in their wall. A wider opening is adjacent portals, one per 256 px (the user's maps do this with `opening.png`).
- `closed: false` is an open door; how Dungeondraft draws an open door of a given texture is unverified.

**object**: `position` (sprite centre), `rotation`, `scale` (uniform `Vector2( s, s )`, s = target px / texture px), `mirror`, `texture`, `layer`, `shadow`, `block_light`, optional `custom_color` (placed before `node_id`), `node_id`.

**path**: `position`, `rotation`, `scale`, `edit_points` (relative to `position`), `smoothness`, `texture`, `width`, `layer`, `fade_in`, `fade_out`, `grow`, `shrink`, `block_light`, `loop`, `node_id`. How `width` relates to texture height is unresolved (13 for a thin line, 256 and 452 elsewhere); verify before generating paths.

`node_id` is a hex string, unique across the level (patterns, walls, portals, objects, paths).

## terrain

`enabled`, `expand_slots`, `smooth_blending`, `texture_1`..`texture_4`, `splat`. Unused slots keep the built-ins (`res://textures/terrain/terrain_dirt.png`, `_gravel`, `_sand`, `_snow`).
- `splat` is a `PoolByteArray` of RGBA weights per **64 px texel, 4x4 texels per square**, row-major (`index = (ty * 4w + tx) * 4`, one weight per slot, summing to 255). Length `16 * w * h * 4`.
- The user paints the whole ground with terrain (often water as slot 1) and lays land on top with patterns, so a `brick_street_broken` pattern lets the terrain show through its gaps.

## Unverified

Dungeondraft was not run against generated maps. Treat these as open until the user reports: pattern tile scale, open-door rendering, wall `_end` caps, world-versus-object shadow flags, path `width`. A generated map that matches a real map's structure but renders oddly points at one of these, not at the JSON syntax.
