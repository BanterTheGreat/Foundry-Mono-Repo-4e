# Asset packs and the texture index

## Pack archives

`.dungeondraft_pack` is a Godot 3 `GDPC` v1 archive (the same format as Dungeondraft's own `.pck`).
- Header: magic `GDPC`, version, Godot version, 16 reserved ints, a file count at byte 84, then entries of `{path length, path padded to 4, offset u64, size u64, 16 md5 bytes}`. The directory sits at the start, so listing a pack never reads texture data. The md5 fields are zeroed; fingerprint duplicates by byte size plus pixel size.
- Contents, all under `res://packs/<id>/`: `pack.json`, `data/default.dungeondraft_tags`, `data/walls/<name>_wall` (path and color), `textures/<kind>/...`, `thumbnails/` and `preview.png` (about half of all entries, skip them).
- `<id>` is the pack's identity and what a map's `asset_manifest` and texture paths use. **The seven BIOMES packs all share id `3DDXdf2M`** with mostly identical file names and recolored art, so a map can use only one of them.
- Tag files can contain trailing commas, so parse them leniently. Tags are the author's and imperfect; search by name when a tag misses.

## Texture kinds and scale

`objects` (placeable props, most textures), `paths`, `patterns` (`normal/` or `colorable/`, tileable, 1024 px), `terrain` (2048 px tiles), `walls` (thin strips tiled along a line, each with a tiny `_end` cap sprite), `portals` (doors and windows, 256 px wide), `lights`, `materials`.

- **256 px = one 5 ft square.** Evidence: the water stairs are 256x263, a standard crate is about 206 px, a Scenes `thickwall` is 254 px thick. Pixel sizes are all the packs give, so verify scale by looking.
- Wall thickness is the texture height: 33 to 330 px, median 88. Only a few families (Scenes `thickwall`, Death `bone2wall`) are a full square thick.
- Families named `*_shadow*` or tagged `Shadow` are grey drop-shadow silhouettes, not the prop. Exclude them when searching for the object.
- **Colorable** textures (index column `colorable`) are drawn raw red until Dungeondraft tints them; they are meant for objects given a `custom_color`. Filter them out of untinted scatter (the dockyard generator refuses them).
- Variants: letters (`_1a`, `_1b`) are alternate versions of one design, digits are different designs.
- Known defect: Shops `tentmarket2_5.png` is a 0-byte file.

## The index

`src/dungeondraft-tools/index-data/` holds a generated, git-ignored, searchable index of every texture (about 23.7k, thumbnails excluded): `assets.tsv`, `catalog/<Pack>.md`, `vocab.md` and a `README.md` usage guide. Read it rather than the packs, which are 7 GB. If it is missing or a pack changed, regenerate it in seconds with `node src/dungeondraft-tools/index/build-index.mjs`. The tools, run from the repository root:

- `index/search.mjs` finds textures by name, tag, pack, kind, size, colorable, and `--no-shadow`; `--files` lists exact paths.
- `index/contact.mjs` renders a numbered thumbnail sheet of search results or of exact `--names "Pack:name[:kind]"`; view it with Read. `index/extract.mjs` writes one texture to disk.
- `lib/png.mjs` is a dependency-free PNG decoder/encoder with a compositing canvas (rotation, scale, tint, alpha shadows, clipped tiling). Map renderers and the preview tool use it.

Choose textures from contact sheets, not names. Names such as `desk` or `door_wood` hide what is actually drawn (flat closed doors, a barred door with hinge knobs), and one wrong pick shows only in the render.
