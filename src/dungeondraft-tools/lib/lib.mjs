// Shared helpers for reading Dungeondraft packs (.dungeondraft_pack = Godot GDPC v1 archives).
import fs from 'node:fs';
import path from 'node:path';
import { INDEX_DIR, PACK_DIR } from '../config.mjs';

export { INDEX_DIR, PACK_DIR };

/**
 * Read the directory table of a GDPC v1 pack (no texture data is loaded).
 * @param {string} file Absolute path to the pack.
 * @returns {{path: string, off: number, size: number, md5: string}[]}
 */
export function readPck(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(88);
    fs.readSync(fd, head, 0, 88, 0);
    if (head.toString('latin1', 0, 4) !== 'GDPC') {
      throw new Error(`Not a GDPC pack: ${file}`);
    }
    const count = head.readUInt32LE(84);
    let buf = Buffer.alloc(0);
    let pos = 88;
    const bufStart = 88;
    const need = (n) => {
      while (pos + n > bufStart + buf.length) {
        const chunk = Buffer.alloc(1 << 20);
        const got = fs.readSync(fd, chunk, 0, chunk.length, bufStart + buf.length);
        if (got === 0) {
          throw new Error('Unexpected EOF in pack directory');
        }
        buf = Buffer.concat([buf, chunk.subarray(0, got)]);
      }
    };
    const entries = [];
    for (let i = 0; i < count; i++) {
      need(4);
      const plen = buf.readUInt32LE(pos - bufStart);
      need(4 + plen + 32);
      const o = pos - bufStart;
      entries.push({
        path: buf.toString('utf8', o + 4, o + 4 + plen).replace(/\0+$/, ''),
        off: Number(buf.readBigUInt64LE(o + 4 + plen)),
        size: Number(buf.readBigUInt64LE(o + 12 + plen)),
        md5: buf.toString('hex', o + 20 + plen, o + 36 + plen),
      });
      pos += 4 + plen + 32;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

/** Read `length` bytes (default: whole entry) of an entry from a pack. */
export function readEntry(file, entry, length = entry.size) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(Math.min(length, entry.size));
    fs.readSync(fd, b, 0, b.length, entry.off);
    return b;
  } finally {
    fs.closeSync(fd);
  }
}

/** PNG width/height from the IHDR chunk (first 24 bytes), or null if not a PNG. */
export function pngSize(file, entry) {
  const b = readEntry(file, entry, 24);
  if (b.length < 24 || b.toString('latin1', 1, 4) !== 'PNG') {
    return null;
  }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** JSON.parse that tolerates trailing commas (present in some Dungeondraft tag files). */
export function parseLoose(text) {
  return JSON.parse(text.replace(/^\uFEFF/, '').replace(/,(\s*[\]}])/g, '$1'));
}

/** Strip the pack-id prefix: res://packs/<id>/textures/x.png -> textures/x.png */
export function relPath(p) {
  return p.replace(/^res:\/\/packs\/[^/]+\//, '');
}

/**
 * Group key for variant sets: drop one trailing variant token such as `_01a`, `3`, `_2d`.
 * "broken_white_wall_01a" -> "broken_white_wall"; "cabinet1a" -> "cabinet".
 */
export function familyOf(name) {
  const f = name.replace(/[_-]?\d+[a-z]{0,2}$/i, '');
  return (f || name).toLowerCase();
}

/** Load the generated assets.tsv into row objects. */
export function loadRows() {
  const tsv = path.join(INDEX_DIR, 'assets.tsv');
  const lines = fs.readFileSync(tsv, 'utf8').split('\n').filter(Boolean);
  const cols = lines.shift().split('\t');
  return lines.map((l) => {
    const v = l.split('\t');
    const r = {};
    cols.forEach((c, i) => {
      r[c] = v[i] ?? '';
    });
    r.w = Number(r.w);
    r.h = Number(r.h);
    r.dups = Number(r.dups);
    return r;
  });
}
