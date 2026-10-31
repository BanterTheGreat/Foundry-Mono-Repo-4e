---
name: dungeondraft
description: Dungeondraft maps and the user's Crosshead asset packs. Use to read or write .dungeondraft_map files, search or preview pack textures, or turn an encounter grid into a battlemap (PNG or native Dungeondraft map).
---

# Dungeondraft

Dungeondraft is a Godot/Mono desktop app. Its maps are plain JSON and its asset
packs are Godot archives, so both can be produced and checked without launching it.
The user operates Dungeondraft; never launch or automate it, ask them to open the
result and report back.

The tooling lives in `src/dungeondraft-tools/` (Node, no dependencies; it is never
deployed to Foundry). `config.mjs` is the only file that knows machine paths; override
any of them with `DD_PACK_DIR`, `DD_INDEX_DIR`, `DD_MAPS_DIR`, `DD_MAP_LIBRARY`,
`DD_REFERENCE_MAP`, `DD_INSTALL_DIR`. Defaults:

- Packs: `C:\Users\Imre\Documents\Dungeondraft Assets\New Crosshead Textures` (21 `.dungeondraft_pack` files, ~7 GB).
- Finished maps, the ground truth for the format: `C:\Users\Imre\Documents\DungeonDraft Maps` (97 files).
- Generated PNGs and maps: `C:\Users\Imre\Documents\Dungeondraft Assets\Generated Maps\<encounter>\`.

Run tests with `npm run test:dungeondraft`. The texture index must exist before any generator
runs (`node src/dungeondraft-tools/index/build-index.mjs`).

Read the matching reference before working:

- [map-format.md](references/map-format.md): schema and verified semantics of `.dungeondraft_map`. Load before reading or writing a map.
- [packs-and-index.md](references/packs-and-index.md): pack archives, texture kinds and scale, the search index and its tools. Load before choosing textures or touching a pack.

## Mapping rules

The user's rules for every map. Hold generated maps and hand-built guidance to all six.

1. **Scale**: keep every object's `scale` within 0.8 to 1.2. When a texture needs more or less, choose a different texture.
2. **Object Shadows off**: `world.object_shadow` false and every object's `shadow` false.
3. **Clutter**: scatter small ground details and clutter across the map, as terrain paints and as objects; they add detail. Difficult terrain gets noticeably more of that clutter inside its region than the ordinary ground detail around it.
4. **Natural grid**: when adapting a grid, let things sit loosely. Offset and rotate props, details and features so they do not sit perfectly inside one square; this applies to practically everything.
5. **Walls on the outer edge of a wall square**: the encounter grid counts a whole square as wall, but a real wall is only an edge. Draw one thin wall along the outside edge of each wall square (the edge facing away from the building or structure), never along its inner edge or through the middle of the square. Every wall runs along a grid line, and rule 4's looseness does not apply to walls. Fill the rest of the wall square with detail: masonry underfoot, plus props such as stone posts, wall shelves, wall lanterns and cobwebs.
6. **Buildings from parts**: build every building from placed walls, patterns and terrain paints. Never use the cave or building tool; their data stays empty (`cave.bitmap` and `entrance_bitmap` all zeros, `shapes.polygons` and `shapes.walls` empty).

`maps/dockyard-warehouse/verify-dungeondraft-map.mjs` enforces rules 1, 2, 5 and 6 exactly,
and rules 3 and 4 as sanity floors (enough ground clutter; nothing snapped dead-centre on a
square). Judge 3 and 4 by eye on the preview as well.

## Craft rules

Lessons from building the dockyard map, held for every map. Cite the rules above as "rule N" and these as "craft rule N".

1. **Look at the render.** A map can pass every check and still look wrong; each real defect so far (a floor covering its clutter, red bottles, swarming rats, faceted blobs) showed only in the picture. Render the preview, zoom in with `inspect/crop.mjs`, and look before calling anything done.
2. **Pattern layering matters.** Keep every pattern at or below the lowest object layer, and put overlapping patterns on different layers instead of relying on file order (the layer table is in map-format.md).
3. **Clutter density reads as terrain.** Dense clutter looks like difficult terrain, so keep ordinary ground detail light and let only difficult terrain be dense. The user trims clutter in compounding 15% steps, and every new map starts from the steps taken so far. The dockyard generator lists them in `CLUTTER_CUTS` (now `[0.15, 0.15]`, so 0.7225 of the original layout). It places the full layout and then removes exactly that share of the clutter, so a map really contains `round(placed × 0.7225)` pieces. Cutting placement attempts instead missed the target, and one map showed no change at all. "Another −15%" means appending `0.15` to the list, a cut of what remains and not of the original. Judge the result by looking (craft rule 1), and let the verifier's clutter floor guard only against a bare map.
4. **Hand-placed organic shapes beat geometric ones.** Worn ground, stains and patches are blobs with plenty of vertices, never rectangles or coarse polygons; clutter comes in themed clusters and piles against walls, and animals are singles, never swarms.
5. **Loosening has limits.** Rule 4 loosens the grid, but a square that carries a rule (cover, an objective, a door) must still read as that square: keep its props within about a third of a square (roughly 85 px) of its centre.
6. **Texture names mislead.** Choose by looking at a contact sheet, never by name. Names hide what is drawn (a "door" that is a flat closed leaf, colorable `x` variants that render raw red), and one wrong pick shows only in the render.

## Build an encounter battlemap

The worked example is `src/dungeondraft-tools/maps/dockyard-warehouse/` and it follows the rules.
Copy its structure for a new encounter:

- `grid.mjs`: parse the encounter's read-only grid (`artifacts/*.html`, cells titled `Column c, row r: <terrain>`). It fixes every wall, door, cover and water square. Terrain labels are free text per encounter, so remap them there; never retype the grid.
- `structure.mjs`: interpret the grid **once**. Decide here what a wall square, a doorway and the room mean for this map (in the example: wall squares are masonry mass with one thin wall on their outer edge, doorways are gaps in that wall plus plank floor) and hand the result out as squares, rectangles, lines, openings and the wall-mass band. Floors, walls and wall detail all read this one object; none of them re-reads the grid. A change of interpretation is then a one-place edit, and the steps cannot disagree.
- `scene.mjs`: compose the whole map as plain data (patterns, walls with openings, terrain, objects) from the structure and a seeded RNG. It asserts rule 1 as it places each object and refuses colorable textures.
- `build-dungeondraft-map.mjs`: serialise the scene to a `.dungeondraft_map` (`--name` picks the file stem, so a revision never overwrites a map the user may be editing).
- `verify-dungeondraft-map.mjs`: structure against a real map of the same build, asset paths, array sizes, the grid geometry, the six rules, colorable textures and layering. It re-derives the geometry from the grid itself on purpose, independent of `structure.mjs`, so a mistake in the structure shows up as a mismatch.
- `preview-dungeondraft-map.mjs`: re-render the file to a PNG (`--pps 256` is native size). It is also how the PNG deliverable is made, so the PNG always shows what the map file contains.

Steps:

1. **Textures**: search the index, view candidates on a contact sheet, pick from the packs only (craft rule 6).
2. **Compose, build, verify, preview.** Done means verify passes, the preview shows what you intended (craft rule 1), and the user has opened the map.
3. **Hand off**: state what is unverified (end of map-format.md) and which toggles to flip (pattern scale, door texture).

How the example applies the rules to a grid whose walls are whole squares (use as a pattern, adapt to the encounter):

- A one-square-thick wall ring becomes masonry (a pattern fill) with a single thin wall loop on its outer edge only; the inner edge gets no wall. Doorways are openings in that one loop, with floor planks through the gap and stone posts flanking the door. The rest of the ring is dressed with props: corner buttresses with cobwebs, shelves and lanterns turned to face the wall (they are drawn mounting-edge up, so rotation 0 faces a north wall and each side turns a quarter turn), and buttress stones between them.
- The quay curb is a stone pattern strip along the water edge.
- Worn ground is an organic blob (`geometry.blob`) of dirt pattern with broken paving over it, not a rectangle.
- Clutter comes in themed clusters (stones, litter, wood, rope, weeds, spills), piles against wall bases, and single pieces; indoor density is lighter than outdoor; vermin are single animals; ground clutter stays 30 to 200 px.

"Only these textures" means every visible pixel comes from a pack. Placement, rotation and scale are compositing; say so when it matters.

## Tools

All under `src/dungeondraft-tools/`; run from the repository root.

- `index/`: `build-index.mjs`, `search.mjs`, `contact.mjs`, `extract.mjs` (see packs-and-index.md).
- `lib/`: `lib.mjs` (pack reader, PNG header, tag parsing), `packs.mjs` (packs by name or id, texture specs, families), `geometry.mjs` (seeded RNG, polygons, blobs, polyline lookup), `png.mjs` (PNG codec and compositing canvas).
- `maps/dockyard-warehouse/`: the example described above.
- `inspect/`: `library-survey.mjs` re-derives the format facts from the user's maps; `map-schema.mjs` prints a map's key tree; `dd-pck.mjs` and `strings.mjs` read the Dungeondraft install; `crop.mjs` zooms into a huge render.

## Environment gotchas

- Windows with no usable Python (the Store stub is blocked); use Node. Long bash heredocs can fail, so write files with the Write tool. Files in this repo may use CRLF, so make scripted edits line-ending tolerant.
- ESM imports of absolute Windows paths need `file:///` URLs; use relative imports. Bash `/tmp` is not Node's `C:\tmp`; use the scratchpad.
- Typed arrays silently ignore fractional indices, which scribbled shadow pixels at the wrong offsets once (a regression test covers it). Round any pixel offset before indexing.
- Textures are sampled bilinearly, so pixels near an edge blend with their neighbours; assert on interior pixels in tests.
- Dungeondraft's game logic is in `res://.mono/assemblies/Release/Dungeondraft.dll` inside its `.pck`: extract it with `inspect/dd-pck.mjs` and scan it with `inspect/strings.mjs` for enum names and JSON keys.
