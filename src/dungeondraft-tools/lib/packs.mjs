// Access to the asset packs by name, id and texture spec, so generators never hand-write `res://packs/...` paths.
import fs from 'node:fs';
import path from 'node:path';
import { PACK_DIR } from '../config.mjs';
import { loadRows, readEntry, readPck } from './lib.mjs';

let scanned = null;

/** Scan every pack's directory table once: { byName, byId } of { file, meta, name, entries: Map(resPath -> entry) }. */
export function packs() {
  if (scanned) { return scanned; }
  const byName = new Map(), byId = new Map();
  for (const f of fs.readdirSync(PACK_DIR).filter((n) => n.endsWith('.dungeondraft_pack')).sort()) {
    const file = path.join(PACK_DIR, f);
    const entries = readPck(file);
    const metaEntry = entries.find((e) => /^res:\/\/packs\/[^/]+\/pack\.json$/.test(e.path));
    if (!metaEntry) { continue; }
    const meta = JSON.parse(readEntry(file, metaEntry).toString('utf8'));
    const pack = { file, meta, name: meta.name.replace(/^CH - /, ''), entries: new Map(entries.map((e) => [e.path, e])) };
    byName.set(pack.name, pack);
    byId.set(meta.id, pack);
  }
  scanned = { byName, byId };
  return scanned;
}

/** `res://packs/<id>/<rel>` for a texture in the named pack; throws if the pack or texture does not exist. */
export function resPath(packName, rel) {
  const pack = packs().byName.get(packName);
  if (!pack) { throw new Error(`Pack not found: ${packName}`); }
  const full = `res://packs/${pack.meta.id}/${rel}`;
  if (!pack.entries.has(full)) { throw new Error(`Texture missing from ${packName}: ${rel}`); }
  return full;
}

/** Bytes of a `res://packs/<id>/...` resource. */
export function readResource(res) {
  const pack = packs().byId.get(res.split('/')[3]);
  const entry = pack?.entries.get(res);
  if (!entry) { throw new Error(`Resource not found: ${res}`); }
  return readEntry(pack.file, entry);
}

let rowCache = null;
/**
 * Look up one indexed texture by spec `Pack:name[:kind]` (name is the texture file name without .png).
 * Returns { pack, rel, name, kind, w, h, colorable }; throws when the spec matches nothing so a typo cannot place a wrong texture.
 */
export function findTexture(spec) {
  const [pack, name, kind] = spec.split(':');
  rowCache ??= loadRows();
  const row = rowCache.find((r) => r.pack === pack && r.name === name && (!kind || r.kind === kind) && r.sub !== 'end');
  if (!row) { throw new Error(`Texture not found in the index: ${spec}`); }
  return { pack: row.pack, rel: row.rel, name: row.name, kind: row.kind, w: row.w, h: row.h, colorable: row.colorable === 'y' };
}

/** All indexed members of a texture family, e.g. familyMembers('Seasons', 'rock_stone', 'objects'). */
export function familyMembers(pack, family, kind = 'objects') {
  rowCache ??= loadRows();
  return rowCache.filter((r) => r.pack === pack && r.family === family && r.kind === kind && r.sub !== 'end')
    .map((r) => ({ pack: r.pack, rel: r.rel, name: r.name, kind: r.kind, w: r.w, h: r.h, colorable: r.colorable === 'y' }));
}
