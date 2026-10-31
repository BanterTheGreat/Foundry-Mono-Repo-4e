// Shared test fixtures: a minimal Godot GDPC v1 archive builder and temp-dir helpers.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Build a minimal Godot GDPC v1 archive in memory: header, directory table, then file data. */
export function buildPck(files) {
  const header = Buffer.alloc(88);
  header.write('GDPC', 0, 'latin1');
  header.writeUInt32LE(1, 4); // format version
  header.writeUInt32LE(3, 8); // Godot 3.4.2
  header.writeUInt32LE(4, 12);
  header.writeUInt32LE(2, 16);
  header.writeUInt32LE(files.length, 84);
  const tableSize = files.reduce((n, f) => n + 4 + Math.ceil((f.path.length + 1) / 4) * 4 + 32, 0);
  let offset = 88 + tableSize;
  const table = [];
  for (const f of files) {
    const padded = Math.ceil((f.path.length + 1) / 4) * 4;
    const entry = Buffer.alloc(4 + padded + 32);
    entry.writeUInt32LE(padded, 0);
    entry.write(f.path, 4, 'utf8');
    entry.writeBigUInt64LE(BigInt(offset), 4 + padded);
    entry.writeBigUInt64LE(BigInt(f.data.length), 12 + padded);
    table.push(entry);
    offset += f.data.length;
  }
  return Buffer.concat([header, ...table, ...files.map((f) => f.data)]);
}

/** A temp directory removed when the test ends. */
export function tempDir(t, prefix = 'dd-tools-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write one file into a fresh temp dir and return its path. */
export function withTempFile(t, name, data) {
  const file = join(tempDir(t), name);
  writeFileSync(file, data);
  return file;
}
