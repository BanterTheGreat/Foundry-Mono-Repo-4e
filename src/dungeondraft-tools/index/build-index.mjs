// Rebuild the index: `node src/dungeondraft-tools/index/build-index.mjs` (run from anywhere). Reads only pack directory tables,
// tag files and 24-byte PNG headers, so it takes a few seconds even though the packs total ~7 GB.
import fs from 'node:fs';
import path from 'node:path';
import { INDEX_DIR, PACK_DIR, readPck, readEntry, pngSize, parseLoose, relPath, familyOf } from '../lib/lib.mjs';

const KINDS = ['objects', 'paths', 'patterns', 'terrain', 'walls', 'portals', 'lights', 'materials'];
const BLURBS = {
  'Above&Below': 'Airships, sailing ships, clouds, caves, giant mushrooms, creatures/mounts, weapons/armor.',
  'Buildings': 'Medieval town buildings: walls, roofs, doors/portals, furniture, shops (alchemist, bakery, bar, blacksmith), carpets, weapons.',
  'Death': 'Undead/graveyard/desolate theme: skeletons and bones, dead trees and plants, red rock, statues, broken stone, floor art.',
  'Dungeondraft': 'Core general-purpose set: trees, bushes, tables/chairs, statues, graves, stairs, corpses, traps, dungeon/sewer dressing, 100+ patterns.',
  'Elements': 'Natural elements: lava, crystals, snow, rock, trees, mushrooms, flowers, shadows.',
  'Foundation': 'Structural construction kit: pillars, roofs, 160 wall styles, 159 patterns, cupboards.',
  'Interior': 'Interior dressing: dining/kitchen/food, bar, butcher, cookware, carpets, chairs, fish, trophies, storage.',
  'Mechanism': 'Gears, pipes, pressure tanks, sewer, acid pits, mechanical creatures.',
  'Modular': 'Modular furniture/kit pieces: alchemy, kitchen, beds, tables, cupboards, windows, signs, clothes, carts, cranes.',
  'Scenes': 'Scene dressing: clothes, roofs, awnings, storage/crates, vases, tables, trees, walls.',
  'Sea': 'Underwater/coastal: sea flora, sea creatures, ships, water terrain, ruins.',
  'Seasons': 'Farm/garden/outdoor: trees, plants, crops, rocks, roofs, paths, animals; seasonal variants.',
  'Shops': 'Shop stock and counters: leatherwork, clothes, food, bakery, tents/stalls.',
  'Tomb & Anvil': 'Graveyards/tombs and smithy: statues, graves, ruins, blacksmith tools, weapons, instruments, carts.',
};

const packFiles = fs.readdirSync(PACK_DIR).filter((n) => n.endsWith('.dungeondraft_pack')).sort();
const rows = [];
const packs = [];
const fpCount = new Map();
const broken = [];

for (const packFile of packFiles) {
  const full = path.join(PACK_DIR, packFile);
  const entries = readPck(full);
  const meta = parseLoose(readEntry(full, entries.find((e) => /^res:\/\/packs\/[^/]+\/pack\.json$/.test(e.path))).toString('utf8'));
  const tagsEntry = entries.find((e) => e.path.endsWith('/data/default.dungeondraft_tags'));
  const tagFile = tagsEntry ? parseLoose(readEntry(full, tagsEntry).toString('utf8')) : { tags: {} };
  const tagsByPath = new Map();
  for (const [tag, list] of Object.entries(tagFile.tags || {})) {
    for (const p of list) {
      if (!tagsByPath.has(p)) {
        tagsByPath.set(p, []);
      }
      tagsByPath.get(p).push(tag.replace(/^\./, ''));
    }
  }
  const short = meta.name.replace(/^CH - /, '');
  const info = { file: packFile, id: meta.id, name: short, version: String(meta.version).replace(',', '.'), counts: {}, tagCounts: {} };
  for (const e of entries) {
    const rel = relPath(e.path);
    const m = rel.match(/^textures\/([^/]+)\/(.+)\.png$/);
    if (!m || !KINDS.includes(m[1])) {
      continue;
    }
    const kind = m[1];
    const sub = m[2].includes('/') ? m[2].split('/')[0] : '';
    let name = path.basename(m[2]);
    let variant = '';
    if (kind === 'walls' && /_end$/.test(name)) {
      name = name.replace(/_end$/, '');
      variant = 'end';
    }
    const tagList = (tagsByPath.get(rel) || []).filter((t) => t !== 'Colorable');
    const colorable = (tagsByPath.get(rel) || []).includes('Colorable') || sub === 'colorable';
    const size = e.size > 0 ? pngSize(full, e) : null;
    if (!size) {
      broken.push(`${short}: ${rel} (${e.size === 0 ? '0 bytes' : 'not a valid PNG'})`);
      continue;
    }
    rows.push({
      pack: short,
      kind,
      sub: sub || variant,
      name,
      family: familyOf(name),
      tags: tagList.join(','),
      colorable: colorable ? 'y' : '',
      w: size.w,
      h: size.h,
      fp: `${e.size}|${size.w}|${size.h}`,
      rel,
    });
    fpCount.set(rows.at(-1).fp, (fpCount.get(rows.at(-1).fp) || 0) + 1);
    info.counts[kind] = (info.counts[kind] || 0) + 1;
    for (const t of tagList) {
      info.tagCounts[t] = (info.tagCounts[t] || 0) + 1;
    }
  }
  packs.push(info);
}

for (const r of rows) {
  r.dups = fpCount.get(r.fp) - 1;
}

// ---- assets.tsv ----
const COLS = ['pack', 'kind', 'sub', 'name', 'family', 'tags', 'colorable', 'w', 'h', 'dups', 'rel'];
const tsv = [COLS.join('\t'), ...rows.map((r) => COLS.map((c) => r[c]).join('\t'))].join('\n') + '\n';
fs.writeFileSync(path.join(INDEX_DIR, 'assets.tsv'), tsv);

// ---- per-pack catalogs ----
const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, '_');
fs.rmSync(path.join(INDEX_DIR, 'catalog'), { recursive: true, force: true });
fs.mkdirSync(path.join(INDEX_DIR, 'catalog'));
const dim = (list) => {
  const ws = list.map((r) => r.w);
  const hs = list.map((r) => r.h);
  const [w0, w1, h0, h1] = [Math.min(...ws), Math.max(...ws), Math.min(...hs), Math.max(...hs)];
  return w0 === w1 && h0 === h1 ? `${w0}x${h0}` : `${w0}-${w1}x${h0}-${h1}`;
};
for (const p of packs) {
  const prow = rows.filter((r) => r.pack === p.name);
  const out = [
    `# ${p.name} (v${p.version}, pack id \`${p.id}\`)`,
    '',
    `File: \`${p.file}\``,
    `Counts: ${KINDS.filter((k) => p.counts[k]).map((k) => `${k} ${p.counts[k]}`).join(', ')}`,
    '',
    'Line format: `family xN [WxH px] {tags}` where N = files in the family (variants `_01a`, `_01b`, ...). `*` after the name = colorable, `~` = some variants colorable. Full file names/paths: assets.tsv.',
    '',
  ];
  for (const kind of KINDS) {
    const krows = prow.filter((r) => r.kind === kind);
    if (!krows.length) {
      continue;
    }
    out.push(`## ${kind} (${krows.length})`, '');
    const fams = new Map();
    for (const r of krows) {
      const k = `${r.sub === 'end' ? '' : r.sub}|${r.family}`;
      if (!fams.has(k)) {
        fams.set(k, []);
      }
      fams.get(k).push(r);
    }
    // Primary tag per family: most covered across members, ties -> most specific (smallest in pack).
    const groups = new Map();
    for (const [k, list] of fams) {
      const cover = new Map();
      for (const r of list) {
        for (const t of r.tags ? r.tags.split(',') : []) {
          cover.set(t, (cover.get(t) || 0) + 1);
        }
      }
      const primary = [...cover.entries()].sort((a, b) => b[1] - a[1] || p.tagCounts[a[0]] - p.tagCounts[b[0]] || a[0].localeCompare(b[0]))[0]?.[0] || (kind === 'objects' ? '(untagged)' : '');
      if (!groups.has(primary)) {
        groups.set(primary, []);
      }
      groups.get(primary).push([k, list]);
    }
    for (const gk of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      if (gk) {
        out.push(`### ${gk}`);
      }
      for (const [k, list] of groups.get(gk).sort((a, b) => a[0].localeCompare(b[0]))) {
        const [sub, fam] = k.split('|');
        const tags = [...new Set(list.flatMap((r) => (r.tags ? r.tags.split(',') : [])))].filter((t) => t !== gk);
        const col = list.every((r) => r.colorable) ? '*' : list.some((r) => r.colorable) ? '~' : '';
        const subTxt = sub ? `${sub}/` : '';
        out.push(`- ${subTxt}${fam}${col} x${list.length} [${dim(list)}]${tags.length ? ' {' + tags.join(',') + '}' : ''}`);
      }
      out.push('');
    }
  }
  fs.writeFileSync(path.join(INDEX_DIR, 'catalog', `${safe(p.name)}.md`), out.join('\n'));
}

// ---- vocab.md: frequent name tokens (what words exist to search for) ----
const tokenFams = new Map();
for (const r of rows) {
  for (const t of new Set(r.family.split(/[^a-z]+/).filter((x) => x.length >= 3))) {
    if (!tokenFams.has(t)) {
      tokenFams.set(t, { fams: new Set(), packs: new Map() });
    }
    const v = tokenFams.get(t);
    v.fams.add(`${r.pack}|${r.kind}|${r.family}`);
    v.packs.set(r.pack, (v.packs.get(r.pack) || 0) + 1);
  }
}
const vocab = [...tokenFams.entries()].filter(([, v]) => v.fams.size >= 4).sort((a, b) => b[1].fams.size - a[1].fams.size || a[0].localeCompare(b[0]));
const vlines = [
  '# Name-token vocabulary',
  '',
  'Words appearing in texture family names (>= 4 families), most common first. Format: `token (families) top packs`. Use these as search terms; the file-name vocabulary is the real vocabulary (the tools do no synonym handling). Rebuilt by build-index.mjs.',
  '',
];
for (const [t, v] of vocab) {
  const top = [...v.packs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}:${c}`).join(' ');
  vlines.push(`${t} (${v.fams.size}) ${top}`);
}
fs.writeFileSync(path.join(INDEX_DIR, 'vocab.md'), vlines.join('\n') + '\n');

// ---- tag vocabulary ----
const tagMap = new Map();
for (const p of packs) {
  for (const [t, n] of Object.entries(p.tagCounts)) {
    if (!tagMap.has(t)) {
      tagMap.set(t, []);
    }
    tagMap.get(t).push([p.name, n]);
  }
}

// ---- README.md ----
const total = rows.length;
const kindTotals = KINDS.map((k) => `${k} ${rows.filter((r) => r.kind === k).length}`).join(', ');
const biomes = packs.filter((p) => p.name.startsWith('BIOMES'));
const biomeName = (n) => n.replace('BIOMES ', '').replace(' New', '');
const readme = [
  '# Crosshead Dungeondraft texture index (agent guide)',
  '',
  `Index of the ${packs.length} Dungeondraft asset packs in \`${PACK_DIR.replace(/\\/g, '/')}\` (${total} textures: ${kindTotals}). Generated by \`build-index.mjs\` from each pack's directory table, \`default.dungeondraft_tags\` and PNG headers; thumbnails/previews are excluded. **Do not read the .dungeondraft_pack files directly; they are ~7 GB. Use the tools below.**`,
  '',
  '## How to find a texture (use this order)',
  '',
  '1. **Search tool** (fastest): `node src/dungeondraft-tools/index/search.mjs <terms> [options]` (run from the repository root). Terms are AND-ed; use `a|b` for OR inside one term. Each term matches the texture name, its tags, or the pack name (case-insensitive, substring). Examples:',
  '   - `node src/dungeondraft-tools/index/search.mjs sarcophagus` - families containing "sarcophagus"',
  '   - `node src/dungeondraft-tools/index/search.mjs "tree|oak" --pack Seasons --kind objects --colorable`',
  '   - `node src/dungeondraft-tools/index/search.mjs bed --tag Bed --files --min-w 300` - every matching file with size and path',
  '   - Options: `--pack <substr>` `--kind <objects|paths|patterns|terrain|walls|portals|lights|materials>` `--tag <Tag>` `--colorable` `--no-shadow` (drop shadow sprites) `--min-w/--max-w/--min-h/--max-h <px>` `--files` (list files, not families) `--limit <n>` (default 40) `--json`.',
  '2. **Look at it**: `node src/dungeondraft-tools/index/extract.mjs "<pack substr>" <name-or-rel-path> [outdir]` writes the PNG (default dir: `src/dungeondraft-tools/index-data/_preview/`) so it can be viewed with the Read tool. Check a candidate visually before recommending it; names are sometimes ambiguous.',
  '   - **Contact sheet** (many candidates at once): `node src/dungeondraft-tools/index/contact.mjs <out.png> <search terms/options>` or `--names "Pack:name[:kind],..."`; prints a numbered list and writes a thumbnail grid to view with Read. `png.mjs` is a dependency-free PNG decode/encode/compositing library used by these tools and by map renderers (e.g. src/dungeondraft-tools/maps/dockyard-warehouse/preview-dungeondraft-map.mjs).',
  '3. **Browse**: `src/dungeondraft-tools/index-data/catalog/<Pack>.md` lists every family per pack grouped by primary tag (`*` = colorable, `~` = some variants colorable). `src/dungeondraft-tools/index-data/vocab.md` lists the words that actually occur in file names. `src/dungeondraft-tools/index-data/assets.tsv` is one row per texture (grep it).',
  '',
  '## assets.tsv columns',
  '',
  '`pack` (display name without "CH - "), `kind`, `sub` (patterns: `normal`/`colorable`; walls: `end` = end-cap sprite), `name` (file name, no .png), `family` (name minus one trailing variant token, lowercase; used for grouping), `tags` (comma-separated Dungeondraft tags, no leading dot, `Colorable` removed), `colorable` (`y` if tagged Colorable or in patterns/colorable), `w`/`h` (pixels), `dups` (count of OTHER textures with the same byte size and pixel dimensions, i.e. almost certainly identical images; the packs store no usable checksums), `rel` (path inside the pack, e.g. `textures/objects/bush_1a.png`).',
  '',
  '## Conventions and gotchas',
  '',
  '- **Kinds:** `objects` (placeable props, the vast majority), `paths` (stroked path textures: walls/fences/roads/rails), `patterns` (tileable floor patterns; `colorable` ones tint), `terrain` (terrain brush textures), `walls` (wall textures; each has a `_end` cap sprite), `portals` (doors/windows/gates), `lights`, `materials`.',
  '- **Variants:** objects come in sets such as `rock_stone_32`, `tree_14a/b/c/d`, `broken_white_wall_01a/01b`. Letters are usually alternate versions/orientations/parts of the same prop; digits are different designs. Search by family, then `--files` to see the variants.',
  '- **Shadow sprites:** families tagged `Shadow` or named `*_shadow*` (e.g. `tree_shadow_01`) are separate grey drop-shadow silhouettes to place under a prop, not the prop itself. Use `--no-shadow` when searching for the prop (verified by viewing Seasons `tree_shadow_01`).',
  '- **Colorable** textures are recolorable in Dungeondraft (red channel tinted); non-colorable ones keep their painted colors.',
  '- **Sizes:** pixel sizes only. Dungeondraft assets are generally authored for roughly 256 px per grid square at scale 1, but verify with `extract.mjs` rather than relying on that.',
  `- **BIOMES packs share one pack id (\`${biomes[0]?.id}\`).** The ${biomes.length} BIOMES packs (${biomes.map((p) => biomeName(p.name)).join(', ')}) have the same id and mostly the same file names with biome-recolored art. Dungeondraft identifies packs by id, so expect only one of them to be usable at a time (the others may be ignored or conflict). Results from different BIOMES packs are distinguished only by the \`pack\` column.`,
  '- Some assets are duplicated across packs (see `dups`); prefer whichever pack the map already uses.',
  ...(broken.length ? [`- **Known pack defects (excluded from the index):** ${broken.join('; ')}.`] : []),
  '- Tag files in some packs contain trailing commas (invalid strict JSON); the tools use a tolerant parser. Tags are pack-defined and imperfect: if a tag search misses, search by name.',
  '- Pack versions use a comma in file names (`v1,1` = 1.1).',
  '- To rebuild after adding/updating packs: `node src/dungeondraft-tools/index/build-index.mjs` (a few seconds).',
  '',
  '## Packs',
  '',
  'Theme blurbs are inferred from tags and file names, not from the author. Counts are textures indexed.',
  '',
  '| Pack | Ver | Id | Textures | Content (top tags) |',
  '|---|---|---|---|---|',
  ...packs.map((p) => {
    const n = Object.values(p.counts).reduce((a, b) => a + b, 0);
    const kinds = KINDS.filter((k) => p.counts[k]).map((k) => `${k} ${p.counts[k]}`).join(', ');
    const top = Object.entries(p.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, c]) => `${t} ${c}`).join(', ');
    const blurb = BLURBS[p.name] || (p.name.startsWith('BIOMES') ? `${biomeName(p.name)} biome: trees, bushes, ferns, grass, rocks, plus terrain/paths/patterns in that palette.` : '');
    return `| ${p.name} | ${p.version} | \`${p.id}\` | ${n} (${kinds}) | ${blurb}${top ? ' Top tags: ' + top + '.' : ''} |`;
  }),
  '',
  '## Tag vocabulary (tag -> packs with counts)',
  '',
  ...[...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, list]) => `- **${t}**: ${list.sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ')}`),
  '',
].join('\n');
fs.writeFileSync(path.join(INDEX_DIR, 'README.md'), readme);
console.log(`Indexed ${total} textures from ${packs.length} packs.`);
console.log(`assets.tsv ${(tsv.length / 1e6).toFixed(1)} MB; catalogs: ${fs.readdirSync(path.join(INDEX_DIR, 'catalog')).length}; vocab tokens: ${vocab.length}`);
