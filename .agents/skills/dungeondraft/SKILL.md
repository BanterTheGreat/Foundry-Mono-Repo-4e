---
name: dungeondraft
description: Dungeondraft maps and the user's Crosshead asset packs. Use to read or write .dungeondraft_map files, search or preview pack textures, or turn an encounter grid into a battlemap (PNG or native Dungeondraft map).
---

# Dungeondraft

Dungeondraft is a Godot/Mono desktop app. Its maps are plain JSON and its asset
packs are Godot archives, so both can be produced and checked without launching it.
The user operates Dungeondraft; never launch or automate it, ask them to open the
result and report back.

Everything the user maps from lives in `C:\Users\Imre\Documents\Dungeondraft Assets\New Crosshead Textures`
(21 `.dungeondraft_pack` files, ~7 GB). Their finished maps are in
`C:\Users\Imre\Documents\DungeonDraft Maps` (97 files, the ground truth for the format).

Read the matching reference before working:

- [map-format.md](references/map-format.md): schema and verified semantics of `.dungeondraft_map`. Load before reading or writing a map.
- [packs-and-index.md](references/packs-and-index.md): pack archives, texture kinds and scale, the search index and its tools. Load before choosing textures or touching a pack.

## Build an encounter battlemap

The worked example is `C:\Users\Imre\Documents\Dungeondraft Assets\Generated Maps\dockyard-warehouse\`.
Copy its scripts as the template: they read the encounter's grid, compose one scene,
and write both outputs from it.

1. **Spec**: the encounter's read-only grid (`artifacts/*.html`, cells titled `Column c, row r: <terrain>`) fixes every wall, door, cover and water square. Parse it, never retype it; terrain labels are free text per encounter, so remap them.
2. **Textures**: search the index, view candidates on a contact sheet, pick from the packs only. Judge by looking, because names mislead.
3. **Scene**: place geometry from the grid and props from a seeded RNG, recording each prop (texture, position, scale, rotation, layer). `build-map.mjs` writes the PNG and `scene-objects.json`; `build-dungeondraft-map.mjs` turns the same record into the map, so the two cannot drift.
4. **Verify**: `verify-dungeondraft-map.mjs` compares the map's key order and value kinds with a real map from the same build, checks every asset path against the packs, array sizes, wall coverage against the grid squares, and portal math. `preview-dungeondraft-map.mjs` re-renders the file to catch placement, scale, rotation and mirror mistakes. Done means verify passes, the preview matches the PNG, and the user has opened the map.
5. **Hand off**: state what is unverified (see the end of map-format.md) and which toggles to flip (shadows, pattern scale, door texture).

"Only these textures" means every visible pixel comes from a pack. Placement, rotation, scale and soft shadows derived from a sprite's own alpha are compositing; say so when it matters.

## Environment gotchas

- Windows with no usable Python (the Store stub is blocked); use Node. Long bash heredocs can fail, so write files with the Write tool.
- ESM imports of absolute Windows paths need `file:///` URLs; use relative imports. Bash `/tmp` is not Node's `C:\tmp`; use the scratchpad.
- Typed arrays silently ignore fractional indices, which scribbled shadow pixels at the wrong offsets once. Round any pixel offset before indexing.
- The Dungeondraft install is `C:\Program Files\Dungeondraft`; its `.pck` is readable with the index's `readPck`, and game logic is in `res://.mono/assemblies/Release/Dungeondraft.dll` (scan its identifier and UTF-16 string heaps for enum names and JSON keys).
