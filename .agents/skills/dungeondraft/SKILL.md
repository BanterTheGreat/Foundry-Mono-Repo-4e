---
name: dungeondraft
description: Dungeondraft maps and the user's Crosshead asset packs. Use ONLY when the user explicitly says "Dungeondraft" (or names a .dungeondraft_map or the Crosshead packs) - to read or write .dungeondraft_map files, search or preview pack textures, or turn an encounter grid into a Dungeondraft map (PNG or native). A plain "battlemap", "map" or "grid" request is NOT a Dungeondraft request; that is the dnd4e-battlemap read-only grid.
---

# Dungeondraft

**When this skill applies.** The user will say "Dungeondraft" whenever they want a Dungeondraft map. Without that word, do not load this skill or run anything in `src/dungeondraft-tools/`. In particular "battlemap", "sample map", "make me a map" or "a 10x10 map" mean the read-only tactical grid from the [Encounter Creation skill](../encounter-creation/SKILL.md) (terrain legend, deployment table, coordinates), not a `.dungeondraft_map` or a pack-texture PNG. If a request is ambiguous, assume the grid; ask only when it could plausibly be either.

Dungeondraft is a Godot/Mono desktop app. Its maps are plain JSON and its asset
packs are Godot archives, so both can be produced and checked without launching it.
The user operates Dungeondraft; never launch or automate it, ask them to open the
result and report back.

The tooling lives in `src/dungeondraft-tools/` (Node, no dependencies; it is never
deployed to Foundry). `config.mjs` is the only file that knows machine paths; override
any of them with `DD_PACK_DIR`, `DD_INDEX_DIR`, `DD_MAPS_DIR`, `DD_MAP_LIBRARY`,
`DD_REFERENCE_MAP`, `DD_INSTALL_DIR`. Defaults:

- Packs: `C:\Users\Imre\Documents\Dungeondraft Assets\New Crosshead Textures` (22 `.dungeondraft_pack` files, ~7 GB: 21 Crosshead plus the Baileywiki shadows pack).
- Finished maps, the ground truth for the format: `C:\Users\Imre\Documents\DungeonDraft Maps` (97 files).
- Generated PNGs and maps: `C:\Users\Imre\Documents\Dungeondraft Assets\Generated Maps\<encounter>\`.

Run tests with `npm run test:dungeondraft`. The texture index must exist before any generator
runs (`node src/dungeondraft-tools/index/build-index.mjs`).

Read the matching reference before working:

- [map-format.md](references/map-format.md): schema and verified semantics of `.dungeondraft_map`. Load before reading or writing a map.
- [packs-and-index.md](references/packs-and-index.md): pack archives, texture kinds and scale, the search index and its tools. Load before choosing textures or touching a pack.

## Mapping rules

The user's rules for every map. Hold generated maps and hand-built guidance to all seven.

1. **Scale**: keep every object's `scale` within 0.8 to 1.2. When a texture needs more or less, choose a different texture. The one exception is the Baileywiki shadow circles (see Shadows), which the user sets at 1.3 and above.
2. **Object Shadows off**: `world.object_shadow` false and every object's `shadow` false.
3. **Clutter**: scatter small ground details and clutter across the map, as terrain paints and as objects; they add detail. Difficult terrain gets noticeably more of that clutter inside its region than the ordinary ground detail around it. Keep the overall density low: the user trims clutter in compounding 15% steps, and every new Dungeondraft map starts from the steps taken so far, not from the default layout. Two cuts have been made, so the standing level is 0.7225 of the original layout. "Another −15%" means a cut of what remains, not of the original. This is a standing calibration for painted maps only; it does not apply to the plain tactical grid. Craft rule 3 gives the mechanism.
4. **Natural grid**: when adapting a grid, let things sit loosely. Offset and rotate props, details and features so they do not sit perfectly inside one square; this applies to practically everything.
5. **Walls on the outer edge of a wall square**: the encounter grid counts a whole square as wall, but a real wall is only an edge. Draw one thin wall along the outside edge of each wall square (the edge facing away from the building or structure), never along its inner edge or through the middle of the square. Every wall runs along a grid line, and rule 4's looseness does not apply to walls. The rest of the square is **walkable floor**, not a wall: continue the room's floor pattern right out to the wall (no stone band, no masonry fill) so it reads as walkable, and keep any dressing flush and small (wall lanterns, shallow wall shelves, corner cobwebs), never posts, buttresses or deep shelving that read as obstacles.
6. **Buildings from parts**: build every building from placed walls, patterns and terrain paints. Never use the cave or building tool; their data stays empty (`cave.bitmap` and `entrance_bitmap` all zeros, `shapes.polygons` and `shapes.walls` empty).
7. **Obvious elevation changes**: make abrupt elevation changes clear along every side visible on the map. For example, surround a raised hill with continuous cliff textures or equivalent height cues on all visible sides; unexplained gaps make its height ambiguous. An intentional slope or ramp may interrupt that edge, but use terrain textures, contours or other visual cues to make the gradual incline apparent.

Each map's `verify-dungeondraft-map.mjs` enforces rules 1, 2, 5 and 6 exactly, and rules 3 and
4 as sanity floors (enough ground clutter; nothing unrotated on a square centre). Rules 1, 2, 4
and 6 are the shared checks in `lib/map-checks.mjs`. Judge 3 and 4 by eye on the preview as
well, and check rule 7 visually.

## Shadows

The user adds depth with the Baileywiki shadow pack (`[BW] Baileywiki Shadows`, pack id `IFGltsLb`, a small non-Crosshead pack in the same folder; `search.mjs --pack Baileywiki`). These are soft shadow textures, not props. They are separate from rule 2: `world.object_shadow` and every object's `shadow` stay false, and the shadows are placed assets instead. Add them to every map that has walls, cliffs or large props.

- **The number is the darkness**: `025` a faint tint, `050`, `075`, `100` solid black at the core. Pick it for how much shade the spot should get; the user used `075` for cliffs and `050` or `075` for props.
- **Shadow paths shade wall bases and cliff sides.** `Half` is hard-edged on its centreline and fades out across one side, which is the look of a wall or cliff casting shade; `Full` fades on both sides. `Large` is a 512 px band (wide, soft), `Small` is 256 px (a tight contact shadow). The hardness is therefore the Half/Full choice and the Large/Small width: Small and high numbers read as a crisp, dark edge, Large and low numbers as diffuse shade.
- **Half shadow orientation**: the centreline is the hard edge and the fade lies to the **left of the direction of travel** on screen. Run the path along the wall or cliff line so that left points away from the wall onto the side that gets shaded. A cliff path travels with the high ground on its left, so its shadow is the same points reversed (this is what the user's touch-ups do). Set path `width` to the texture height (512 or 256), smoothness 1. The cliff strip or wall hides the hard edge only if the path is below it; see Shadow path layer.
- **Shadow circles go under the biggest props** (tree canopies, logs, big stones, hearths), centred on them with a small offset, to give them presence on the map. Use `BW_Shadow_Circle_050` or `075`, scale 1.3 or more (rule 1 does not apply to them, so never the colorable one), layer `-100`. Small clutter gets none.
- **Shadow path layer**: put shadow **paths** on a layer below walls but above the other objects, so they shade the props they fall on too (the user's rule; walls draw above layers 100-400, so this is the highest user layer under the walls, 400, provided no prop needs a higher one). A path on `-100` under everything never touches a crate or a shelf and looks painted on the floor. Circles under big props are objects and are not covered by this rule. `lib/shadows.mjs` exports `SHADOW_PATH_LAYER` (400) for paths and keeps `SHADOW_LAYER` (-100) for circles. The dockyard generator, verifier and tests use it. **Cloudwood is not migrated:** it still puts its cliff shadow paths on `SHADOW_LAYER`; migrate it when asked.
- The generators compose shadows last from their own seeded RNG so adding or retuning them never moves the rest of a layout. `circleShadows` in `lib/scene-kit.mjs` does this for the circles under big props (its own stream, scale 1.3 to 2, the shadow layer); `shadowPathRecord` builds the BW path records.

`lib/shadows.mjs` holds the texture specs (`shadowPathSpec`, `shadowCircleSpec`), the layer and the scale exemption. The Cloudwood generator uses them (`CLIFF_SHADOW`, `BIG_PROP_PX` in its `scene.mjs`) and its verifier checks that every cliff has a reversed half shadow and every canopy, log and the hearth has a circle. The dockyard generator uses them too (`WALL_SHADOW_OUTER`, `WALL_SHADOW_INNER`, `QUAY_SHADOW` in its `scene.mjs`): a Large `Half` strip along the building's outer wall line, a Small one along the same wall line fading onto the floor inside, a dark Large one along the quay edge (rule 7: it falls on the water), and a circle under each tall cargo stack and the ledger desk. Runs are straight, one per wall side, and stop at the doorways. Do not wrap a run round a corner: the overhang leaves a hard-edged block, so strips just meet at the building corner. The paths sit above every pattern; the circles are on `-100`, so the dockyard composer throws if a pattern on a higher layer overlaps one, and its verifier checks it again.

## Craft rules

Lessons from building the dockyard map, held for every map. Cite the rules above as "rule N" and these as "craft rule N".

1. **Look at the render.** A map can pass every check and still look wrong; each real defect so far (a floor covering its clutter, red bottles, swarming rats, faceted blobs) showed only in the picture. Render the preview, zoom in with `inspect/crop.mjs`, and look before calling anything done.
2. **Pattern layering matters.** Keep every pattern at or below the lowest object layer, and put overlapping patterns on different layers instead of relying on file order (the layer table is in map-format.md).
3. **Clutter density reads as terrain.** Dense clutter looks like difficult terrain, so keep ordinary ground detail light and let only difficult terrain be dense. Rule 3 sets the standing density cuts. `lib/scene-kit.mjs` lists them once in `CLUTTER_CUTS` (now `[0.15, 0.15]`, so 0.7225 of the original layout) and every generator re-exports that same array. Each places the full layout and then `applyClutterCuts` removes exactly that share of the clutter, so a map really contains `round(placed × 0.7225)` pieces. Cutting placement attempts instead missed the target (rejected attempts place nothing), and thinning the layout while generating it would shift every later draw from the seeded stream and move the rest of the map; removing afterwards keeps every other prop where it was, and a deeper cut removes a superset of a shallower one. A further cut means appending `0.15` to the one list in `lib/scene-kit.mjs`, which applies to every map. Revisions of an already delivered map go to a new file name. Judge the result by looking (craft rule 1), and let the verifier's clutter floor guard only against a bare map.
4. **Hand-placed organic shapes beat geometric ones.** Worn ground, stains and patches are blobs with plenty of vertices, never rectangles or coarse polygons; clutter comes in themed clusters and piles against walls, and animals are singles, never swarms.
5. **Loosening has limits.** Rule 4 loosens the grid, but a square that carries a rule (cover, an objective, a door) must still read as that square: keep its props within about a third of a square (roughly 85 px) of its centre.
6. **Texture names mislead.** Choose by looking at a contact sheet, never by name. Names hide what is drawn (a "door" that is a flat closed leaf, colorable `x` variants that render raw red), and one wrong pick shows only in the render.

## Build an encounter battlemap

The worked example is `src/dungeondraft-tools/maps/dockyard-warehouse/` and it follows the rules.
Copy its structure for a new encounter:

- `grid.mjs`: parse the encounter's read-only grid (`artifacts/*.html`, cells titled `Column c, row r: <terrain>`). It fixes every wall, door, cover and water square. Grids from the [dnd4e-battlemap skill](../dnd4e-battlemap/SKILL.md) now draw walls as edges instead of squares: their cells carry `data-walls` / `data-doors` attributes (compass letters, written on both neighbours of a shared edge), which map straight onto wall lines on grid coordinates (mapping rule 5) with no wall-square reinterpretation. `lib/edge-grid.mjs` reads them (`hasEdgeData`, `parseEdgeGrid`: cells with their sides, each shared edge once in px, and collinear edges merged into straight runs with doors kept as openings on the run, so a new map's `grid.mjs` can build on it and fails loudly when an edge is not written on both neighbours). No map uses it yet: the three existing maps use the older whole-square walls and their own parsers. Terrain labels are free text per encounter, so remap them there; never retype the grid.
- `structure.mjs`: interpret the grid **once**. Decide here what a wall square, a doorway and the room mean for this map (in the example: wall squares are plank floor with one thin wall on their outer edge, doorways are gaps in that wall) and hand the result out as squares, rectangles, lines, openings and the wall-dressing band. Floors, walls and wall detail all read this one object; none of them re-reads the grid. A change of interpretation is then a one-place edit, and the steps cannot disagree.
- `scene.mjs`: compose the whole map as plain data (patterns, walls with openings, terrain, objects) from the structure and a seeded RNG. It asserts rule 1 as it places each object and refuses colorable textures.
- `build-dungeondraft-map.mjs`: a thin entry script. It reads the encounter, composes the scene, paints the terrain splat (the one map-specific serialising step) and hands the scene to `lib/map-writer.mjs`, which serialises it to a `.dungeondraft_map` (`--name` picks the file stem, so a revision never overwrites a map the user may be editing). A change to the file format or a pack-wide default (the manifest, cave data, palettes) is made once in `lib/map-writer.mjs` and applies to every map.
- `verify-dungeondraft-map.mjs`: structure against a real map of the same build, asset paths, array sizes, the grid geometry, mapping rules 1–6, colorable textures and layering. The map-independent checks (structure, array sizes, assets and manifest, colorable textures, rules 1, 2, 4 and 6, BW shadow textures, node ids) come from `lib/map-checks.mjs`; what stays in the map's own file is everything about its grid: walls and openings, floors and terrain, clutter density (rule 3), wall alignment (rule 5), props that mark grid squares, and where each shadow goes. It re-derives the geometry from the grid itself on purpose, independent of `structure.mjs`, so a mistake in the structure shows up as a mismatch. Check rule 7 visually in the preview.
- `preview-dungeondraft-map.mjs`: a thin entry script that only names the map's default file; `lib/map-preview.mjs` re-renders it to a PNG (`--pps 256` is native size) and draws patterns, paths, walls, objects and all four terrain slots for every map. It is also how the PNG deliverable is made, so the PNG always shows what the map file contains.

Steps:

1. **Textures**: search the index, view candidates on a contact sheet, pick from the packs only (craft rule 6).
2. **Compose, build, verify, preview.** Done means verify passes, the preview shows what you intended (craft rule 1), and the user has opened the map.
3. **Hand off**: state what is unverified (end of map-format.md) and which toggles to flip (pattern scale, door texture).

How the example applies the rules to a grid whose walls are whole squares (use as a pattern, adapt to the encounter):

- A one-square-thick wall ring is plank floor like the room, with a single thin wall loop on its outer edge only; there is no inner wall and no masonry. Doorways are openings in that one loop, with the same planks through the gap and a wall lantern at each gap edge. The ring is dressed lightly and flush to the wall: corner cobwebs, shallow shelves and lanterns turned to face the wall (they are drawn mounting-edge up, so rotation 0 faces a north wall and each side turns a quarter turn).
- The quay curb is a stone pattern strip along the water edge.
- Worn ground is an organic blob (`geometry.blob`) of dirt pattern with broken paving over it, not a rectangle.
- Clutter comes in themed clusters (stones, litter, wood, rope, weeds, spills), piles against wall bases, and single pieces; indoor density is lighter than outdoor; vermin are single animals; ground clutter stays 30 to 200 px.

"Only these textures" means every visible pixel comes from a pack. Placement, rotation and scale are compositing; say so when it matters.

## Tools

All under `src/dungeondraft-tools/`; run from the repository root.

- `index/`: `build-index.mjs`, `search.mjs`, `contact.mjs`, `extract.mjs` (see packs-and-index.md).
- `lib/`: `lib.mjs` (pack reader, PNG header, tag parsing), `packs.mjs` (packs by name or id, texture specs, families), `geometry.mjs` (seeded RNG, polygons, blobs, polyline lookup), `png.mjs` (PNG codec and compositing canvas), `map-writer.mjs` (`serialiseMap`, `writeMapFile`, `describeMap`: the shared `.dungeondraft_map` serialiser), `map-preview.mjs` (`renderMapPreview`, `previewCli`: the shared map renderer), `cli.mjs` (`--flag` parsing for the entry scripts), `map-checks.mjs` (`createChecker` plus the shared verifier checks), `edge-grid.mjs` (reader for edge-wall grids), `scene-kit.mjs` (what every `scene.mjs` shares: `CLUTTER_CUTS` and `applyClutterCuts`, the rule 1 scale range and `buildObject`, `circleShadows`, the pattern, path, wall and shadow-path record builders, `onWall`, `makeFam`, `assertThemes`, the shared crate and lamp texture lists, and `randomHelpers`). `geometry.mjs` also holds `distToSegment` and `distToPolyline`. Seeded randomness is order-sensitive, so anything moved into `scene-kit.mjs` must not change how many draws a scene makes or in what order; check by building each map before and after and comparing the files. Tests: `test/map-writer.test.mjs`, `test/map-checks.test.mjs`, `test/edge-grid.test.mjs`, `test/scene-kit.test.mjs`.
- `maps/dockyard-warehouse/`: the example described above (a walled building).
- `lib/shadows.mjs`: BW shadow texture specs, layer and scale exemption (see Shadows).
- `maps/cloudwood-mole/`: an outdoor, elevation-driven example (grid padded by one square per side, terrain-painted stream, cliff / stair / plank paths with BW cliff and prop shadows, no walls). It has no patterns or walls, so its scene leaves those out and the serialiser writes them as empty arrays. Run `build-dungeondraft-map.mjs`, `verify-dungeondraft-map.mjs` and the preview from the repository root; the encounter is read from `output/encounters/<name>.html`.
- `maps/grappa-safehouse/`: a walled building with interior partitions plus a street and a corridor added around it (a ZEITGEIST / Flint look: red brick, granite, gas lamps, copper pipes, clockwork; the encounter grid is read from `output/maps/grappa-safehouse.json`, extended 3 squares east and 2 south, with the original numbering kept). It follows the dockyard pattern (grid, structure, scene, build, verify, preview) and adds: a wall list with several lines (the outer ring on its outer edge, one horizontal and one vertical partition, and the neighbouring corridor wall), each ordered so the half shadow's left-of-travel fade falls on the open side; partitions put their one line on the edge facing the open room (horizontal on the south edge, vertical on the east edge), so the wall mass belongs to the other room; shadow paths on layer 400 above the props (the Shadow path layer rule), split at doorways, with Small contact shadows where wall mass meets floor; no prop on layer 400 (use 300 at most, 700 for wall-mounted lamps). `structure.mjs` throws on a layout it cannot draw, so a changed grid fails loudly. Tests: `test/grappa-structure.test.mjs` and `test/grappa-scene.test.mjs`.
- `inspect/`: `library-survey.mjs` re-derives the format facts from the user's maps; `map-schema.mjs` prints a map's key tree; `dd-pck.mjs` and `strings.mjs` read the Dungeondraft install; `crop.mjs` zooms into a huge render.

## Environment gotchas

- Windows with no usable Python (the Store stub is blocked); use Node. Long bash heredocs can fail, so write files with the Write tool. Files in this repo may use CRLF, so make scripted edits line-ending tolerant.
- ESM imports of absolute Windows paths need `file:///` URLs; use relative imports. Bash `/tmp` is not Node's `C:\tmp`; use the scratchpad.
- Typed arrays silently ignore fractional indices, which scribbled shadow pixels at the wrong offsets once (a regression test covers it). Round any pixel offset before indexing.
- Textures are sampled bilinearly, so pixels near an edge blend with their neighbours; assert on interior pixels in tests.
- Dungeondraft's game logic is in `res://.mono/assemblies/Release/Dungeondraft.dll` inside its `.pck`: extract it with `inspect/dd-pck.mjs` and scan it with `inspect/strings.mjs` for enum names and JSON keys.
