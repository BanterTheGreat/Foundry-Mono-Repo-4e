import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ARTIFACTS_DIR, INDEX_DIR, REPO_DIR } from '../config.mjs';
import { cliArg, cliMapPath } from '../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../lib/map-writer.mjs';
import { renderMapPreview } from '../lib/map-preview.mjs';
import { composeScene as composeCloudwood } from '../maps/cloudwood-mole/scene.mjs';
import { composeScene as composeDockyard } from '../maps/dockyard-warehouse/scene.mjs';
import { composeScene as composeGrappa } from '../maps/grappa-safehouse/scene.mjs';

const NOW = new Date(2026, 9, 31, 12, 0, 0);
const haveIndex = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv'));
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const cloudwoodHtml = read(path.join(REPO_DIR, 'output', 'encounters', 'cloudwood-mole.html'));
const dockyardHtml = read(path.join(ARTIFACTS_DIR, 'dockyard-warehouse.html'));
const grappaJson = read(path.join(REPO_DIR, 'output', 'maps', 'grappa-safehouse.json'));

/** Every encounter whose input and the texture index are present, composed and serialised once. */
const maps = {};
if (haveIndex) {
  const dirt = (scene) => { const s = new Array(scene.world.cols * 4 * scene.world.rows * 4 * 4).fill(0); for (let i = 0; i < s.length; i += 4) { s[i] = 255; } return s; };
  if (cloudwoodHtml) { const scene = composeCloudwood(cloudwoodHtml); maps.cloudwood = { scene, splat: scene.terrain.splat }; }
  if (dockyardHtml) { const scene = composeDockyard(dockyardHtml); maps.dockyard = { scene, splat: dirt(scene) }; }
  if (grappaJson) { const scene = composeGrappa(JSON.parse(grappaJson)); maps.grappa = { scene, splat: dirt(scene) }; }
}
const build = ({ scene, splat }) => serialiseMap(scene, { seed: 20261031, splat, cameraZoom: 3.2, now: NOW });
const skip = !Object.keys(maps).length;

test('serialisation is deterministic for a fixed scene and creation time', { skip }, () => {
  for (const m of Object.values(maps)) {
    assert.deepEqual(build(m).map, build(m).map);
  }
});

test('every node id is unique and next_node_id is past the highest', { skip }, () => {
  for (const m of Object.values(maps)) {
    const { map } = build(m);
    const lv = map.world.levels['0'];
    const ids = [...lv.patterns, ...lv.walls, ...lv.walls.flatMap((w) => w.portals), ...lv.paths, ...lv.objects].map((e) => parseInt(e.node_id, 16));
    assert.equal(new Set(ids).size, ids.length, 'unique ids');
    assert.ok(parseInt(map.world.next_node_id, 16) > Math.max(...ids));
  }
});

test('an outdoor scene without patterns or walls serialises to empty arrays', { skip: !maps.cloudwood }, () => {
  const lv = build(maps.cloudwood).map.world.levels['0'];
  assert.deepEqual(lv.patterns, []);
  assert.deepEqual(lv.walls, []);
  assert.ok(lv.paths.length > 0 && lv.objects.length > 0);
});

test('a walled scene writes each opening as a portal on its wall', { skip: !maps.grappa }, () => {
  const lv = build(maps.grappa).map.world.levels['0'];
  assert.equal(lv.walls.length, maps.grappa.scene.walls.length);
  for (const w of lv.walls) {
    for (const p of w.portals) {
      assert.equal(p.wall_id, w.node_id);
      assert.ok(Number.isInteger(p.point_index) && p.wall_distance >= p.point_index && p.wall_distance <= p.point_index + 1);
    }
  }
  assert.equal(lv.walls.reduce((n, w) => n + w.portals.length, 0), maps.grappa.scene.walls.reduce((n, w) => n + w.openings.length, 0));
});

test('mapping rules 2 and 6: no object shadows and no cave, building or tile data', { skip }, () => {
  for (const m of Object.values(maps)) {
    const { map } = build(m);
    const lv = map.world.levels['0'];
    assert.equal(map.world.object_shadow, false);
    assert.ok(lv.objects.every((o) => o.shadow === false));
    assert.deepEqual(lv.shapes, { polygons: [], walls: [] });
    const zero = (s) => s.replace(/^PoolByteArray\( /, '').replace(/ \)$/, '').split(', ').every((v) => v === '0');
    assert.ok(zero(lv.cave.bitmap) && zero(lv.cave.entrance_bitmap));
  }
});

test('array sizes follow the map size and the manifest lists exactly the packs used', { skip }, () => {
  for (const m of Object.values(maps)) {
    const { map, usedPacks } = build(m);
    const { cols, rows } = m.scene.world;
    const lv = map.world.levels['0'];
    const count = (s) => s.replace(/^Pool\w+\( /, '').replace(/ \)$/, '').split(', ').length;
    assert.equal(map.world.width, cols);
    assert.equal(map.world.height, rows);
    assert.equal(count(lv.terrain.splat), cols * 4 * rows * 4 * 4);
    assert.equal(count(lv.cave.bitmap), Math.floor(2 * cols * rows + 1.5 * (cols + rows) + 2));
    assert.equal(count(lv.tiles.cells), cols * rows);
    assert.equal(map.header.asset_manifest.length, usedPacks.size);
  }
});

test('the camera zoom and creation time come from the options', { skip }, () => {
  const { map } = serialiseMap(Object.values(maps)[0].scene, { seed: 1, splat: Object.values(maps)[0].splat, cameraZoom: 5, now: NOW });
  assert.equal(map.header.editor_state.camera_zoom, 5);
  assert.equal(map.header.creation_date.year, 2026);
  assert.equal(map.header.creation_date.month, 10);
  assert.equal(map.world.msi.seed, '00000001');
});

test('describeMap summarises only what the map contains', () => {
  const usedPacks = new Set(['Seasons', 'Interior']);
  const stats = { clutter: 7 };
  assert.equal(describeMap({ counts: { patterns: 0, walls: 0, portals: 0, paths: 2, objects: 9 }, usedPacks }, stats), '2 paths, 9 objects (7 clutter); packs: Interior, Seasons');
  assert.equal(describeMap({ counts: { patterns: 3, walls: 1, portals: 4, paths: 2, objects: 9 }, usedPacks }, stats), '3 patterns, 1 walls (4 portals), 2 paths, 9 objects (7 clutter); packs: Interior, Seasons');
});

test('written maps and their previews round-trip through the files', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-writer-'));
  try {
    const m = Object.values(maps)[0];
    const { map } = build(m);
    const file = writeMapFile(map, path.join(dir, 'nested'), 'sample');
    assert.equal(file, path.join(dir, 'nested', 'sample.dungeondraft_map'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(map)));
    const preview = renderMapPreview(file, { pps: 8 });
    assert.equal(preview.file, path.join(dir, 'nested', 'sample-preview.png'));
    assert.equal(preview.width, m.scene.world.cols * 8);
    assert.equal(preview.height, m.scene.world.rows * 8);
    assert.ok(fs.statSync(preview.file).size > 100);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cliArg reads the value after a flag and cliMapPath ignores flags', () => {
  const saved = process.argv;
  try {
    process.argv = ['node', 'x.mjs', '--seed', '42', '--name', 'abc'];
    assert.equal(cliArg('--seed', 1), '42');
    assert.equal(cliArg('--missing', 'fallback'), 'fallback');
    assert.equal(cliMapPath('default.map'), 'default.map');
    process.argv = ['node', 'x.mjs', 'given.map', '--pps', '8'];
    assert.equal(cliMapPath('default.map'), 'given.map');
  } finally {
    process.argv = saved;
  }
});
