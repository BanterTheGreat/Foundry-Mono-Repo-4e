import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { encodePng } from '../lib/png.mjs';
import { buildPck } from './helpers.mjs';

// config.mjs reads its environment overrides when first imported, so point them at fixtures before importing the module.
const root = mkdtempSync(join(tmpdir(), 'dd-packs-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
const packDir = join(root, 'packs'), indexDir = join(root, 'index');
mkdirSync(packDir);
mkdirSync(indexDir);
const png = encodePng({ w: 4, h: 2, data: new Uint8Array(4 * 2 * 4).fill(255) });
const packJson = { name: 'CH - Test Pack', id: 'TeSt1234', version: '1', author: 'Test' };
writeFileSync(join(packDir, 'CH - Test Pack v1.dungeondraft_pack'), buildPck([
  { path: 'res://packs/TeSt1234/pack.json', data: Buffer.from(JSON.stringify(packJson)) },
  { path: 'res://packs/TeSt1234/textures/objects/crate_01.png', data: png },
  { path: 'res://packs/TeSt1234/textures/objects/crate_02.png', data: png },
  { path: 'res://packs/TeSt1234/textures/objects/dye_bottle_1x.png', data: png },
]));
writeFileSync(join(packDir, 'notes.txt'), 'not a pack');
const cols = 'pack\tkind\tsub\tname\tfamily\ttags\tcolorable\tw\th\tdups\trel';
const row = (name, family, colorable) => ['Test Pack', 'objects', '', name, family, '', colorable, 4, 2, 0, `textures/objects/${name}.png`].join('\t');
writeFileSync(join(indexDir, 'assets.tsv'), [cols, row('crate_01', 'crate', ''), row('crate_02', 'crate', ''), row('dye_bottle_1x', 'dye_bottle', 'y')].join('\n') + '\n');
process.env.DD_PACK_DIR = packDir;
process.env.DD_INDEX_DIR = indexDir;
const { packs, resPath, readResource, findTexture, familyMembers } = await import('../lib/packs.mjs');

test('packs() scans only .dungeondraft_pack files and indexes them by display name and id', () => {
  const { byName, byId } = packs();
  assert.deepEqual([...byName.keys()], ['Test Pack'], 'the "CH - " prefix is dropped and the stray .txt is ignored');
  assert.equal(byId.get('TeSt1234'), byName.get('Test Pack'));
  assert.deepEqual(byName.get('Test Pack').meta, packJson);
  assert.ok(byName.get('Test Pack').entries.has('res://packs/TeSt1234/textures/objects/crate_01.png'));
});

test('resPath builds res:// paths and refuses unknown packs or textures', () => {
  assert.equal(resPath('Test Pack', 'textures/objects/crate_01.png'), 'res://packs/TeSt1234/textures/objects/crate_01.png');
  assert.throws(() => resPath('Test Pack', 'textures/objects/missing.png'), /Texture missing from Test Pack/);
  assert.throws(() => resPath('No Such Pack', 'textures/objects/crate_01.png'), /Pack not found/);
});

test('readResource returns a texture\'s bytes by res:// path', () => {
  assert.deepEqual(readResource('res://packs/TeSt1234/textures/objects/crate_02.png'), png);
  assert.throws(() => readResource('res://packs/TeSt1234/textures/objects/nope.png'), /Resource not found/);
  assert.throws(() => readResource('res://packs/ZZZZZZZZ/textures/objects/crate_01.png'), /Resource not found/);
});

test('findTexture resolves a spec through the index, exposes size and colorable, and rejects typos', () => {
  assert.deepEqual(findTexture('Test Pack:crate_01:objects'), { pack: 'Test Pack', rel: 'textures/objects/crate_01.png', name: 'crate_01', kind: 'objects', w: 4, h: 2, colorable: false });
  assert.equal(findTexture('Test Pack:dye_bottle_1x').colorable, true);
  assert.throws(() => findTexture('Test Pack:crate_99:objects'), /Texture not found in the index/);
  assert.throws(() => findTexture('Test Pack:crate_01:paths'), /Texture not found in the index/);
});

test('familyMembers lists every member of a family with its colorable flag', () => {
  assert.deepEqual(familyMembers('Test Pack', 'crate').map((m) => m.name), ['crate_01', 'crate_02']);
  assert.deepEqual(familyMembers('Test Pack', 'dye_bottle').map((m) => m.colorable), [true]);
  assert.deepEqual(familyMembers('Test Pack', 'nothing'), []);
});
