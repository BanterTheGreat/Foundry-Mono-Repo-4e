import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyOf, parseLoose, pngSize, readEntry, readPck, relPath } from '../lib/lib.mjs';
import { encodePng } from '../lib/png.mjs';
import { buildPck, withTempFile } from './helpers.mjs';

test('readPck lists entries from the directory table and readEntry returns exactly their bytes', (t) => {
  const png = encodePng({ w: 3, h: 2, data: new Uint8Array(3 * 2 * 4).fill(255) });
  const pack = withTempFile(t, 'test.dungeondraft_pack', buildPck([
    { path: 'res://packs/AbCdEfGh/pack.json', data: Buffer.from('{"id":"AbCdEfGh"}') },
    { path: 'res://packs/AbCdEfGh/textures/objects/crate_01.png', data: png },
    { path: 'res://packs/AbCdEfGh/textures/objects/empty.png', data: Buffer.alloc(0) },
  ]));
  const entries = readPck(pack);
  assert.deepEqual(entries.map((e) => e.path), [
    'res://packs/AbCdEfGh/pack.json',
    'res://packs/AbCdEfGh/textures/objects/crate_01.png',
    'res://packs/AbCdEfGh/textures/objects/empty.png',
  ]);
  assert.equal(readEntry(pack, entries[0]).toString('utf8'), '{"id":"AbCdEfGh"}');
  assert.deepEqual(readEntry(pack, entries[1]), png);
  assert.equal(entries[2].size, 0);
});

test('readPck rejects files that are not GDPC archives', (t) => {
  const notPack = withTempFile(t, 'bad.dungeondraft_pack', Buffer.alloc(200, 7));
  assert.throws(() => readPck(notPack), /Not a GDPC pack/);
});

test('pngSize reads dimensions from the IHDR without decoding, and returns null for non-PNG or empty entries', (t) => {
  const png = encodePng({ w: 37, h: 11, data: new Uint8Array(37 * 11 * 4).fill(255) });
  const pack = withTempFile(t, 'sizes.dungeondraft_pack', buildPck([
    { path: 'res://packs/x/a.png', data: png },
    { path: 'res://packs/x/b.txt', data: Buffer.from('this is not a png at all, sorry') },
    { path: 'res://packs/x/c.png', data: Buffer.alloc(0) },
  ]));
  const [a, b, c] = readPck(pack);
  assert.deepEqual(pngSize(pack, a), { w: 37, h: 11 });
  assert.equal(pngSize(pack, b), null);
  assert.equal(pngSize(pack, c), null);
});

test('parseLoose accepts the trailing commas and BOM found in real tag files', () => {
  const text = '﻿{\n\t"tags": {\n\t\t".Broken": [\n\t\t\t"textures/objects/a.png",\n\t\t\t"textures/objects/b.png",\n\t\t],\n\t},\n}';
  assert.deepEqual(parseLoose(text), { tags: { '.Broken': ['textures/objects/a.png', 'textures/objects/b.png'] } });
  assert.throws(() => JSON.parse(text), 'strict JSON rejects the same text');
});

test('relPath strips the res://packs/<id>/ prefix', () => {
  assert.equal(relPath('res://packs/3DDXdf2M/textures/objects/bush_1a.png'), 'textures/objects/bush_1a.png');
  assert.equal(relPath('textures/objects/bush_1a.png'), 'textures/objects/bush_1a.png');
});

test('familyOf groups variants by dropping one trailing variant token', () => {
  assert.equal(familyOf('broken_white_wall_01a'), 'broken_white_wall');
  assert.equal(familyOf('cabinet1a'), 'cabinet');
  assert.equal(familyOf('Crate_01'), 'crate');
  assert.equal(familyOf('tree_14d'), 'tree');
  assert.equal(familyOf('bush'), 'bush');
  assert.equal(familyOf('2048'), '2048', 'a name that is only a number keeps itself');
});
