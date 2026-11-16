import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { serialiseMap, writeMapFile } from '../lib/map-writer.mjs';
import { renderMapPreview } from '../lib/map-preview.mjs';
import { checkArraySizes, checkNodes } from '../lib/map-checks.mjs';
import { decodePng } from '../lib/png.mjs';

const scene = () => ({ world: { cols: 2, rows: 1, size: 256 }, terrain: { textures: [], enabled: false }, paths: [], objects: [] });
const splat = () => Array.from({ length: 128 }, (_, i) => i % 4 === 0 ? 255 : 0);
const options = () => ({ seed: 1, splat: splat(), cameraZoom: 2, now: new Date(2026, 0, 1) });
const multi = () => ({ world: scene().world, levels: [{ label: 'Carriages', scene: scene(), splat: splat() }, { label: 'Ground', scene: scene(), splat: splat() }] });

test('multiple levels require explicit input; single-level output stays compatible', () => {
  const single = serialiseMap(scene(), options());
  const explicit = serialiseMap({ world: scene().world, levels: [{ label: 'Ground', scene: scene(), splat: splat() }] }, options());
  assert.deepEqual(single, explicit);
  const { map } = serialiseMap(multi(), { ...options(), currentLevel: 1 });
  assert.deepEqual(Object.keys(map.world.levels), ['0', '1']);
  assert.equal(map.world.levels[0].label, 'Carriages');
  assert.equal(map.world.levels[1].label, 'Ground');
  assert.equal(map.world.levels[0].terrain.enabled, false);
  assert.equal(map.header.editor_state.current_level, 1);
});

test('invalid levels, dimensions, selected level, and terrain fail clearly', () => {
  for (const levels of [[], {}]) {
    assert.throws(() => serialiseMap({ world: scene().world, levels }, options()), /nonempty array/);
  }
  assert.throws(() => serialiseMap(multi(), { ...options(), currentLevel: 2 }), /existing level/);
  for (const mutate of [
    (m) => { m.levels[1].scene.world.cols = 3; },
    (m) => { m.levels[1].label = ''; },
    (m) => { m.levels[1].splat.pop(); },
    (m) => { m.levels[1].splat = undefined; },
  ]) {
    const m = multi();
    mutate(m);
    assert.throws(() => serialiseMap(m, options()));
  }
});

test('array and node validation inspects later levels and cross-level duplicates', () => {
  const { map } = serialiseMap(multi(), options());
  const failures = [];
  const ok = (condition, message) => { if (!condition) { failures.push(message); } };
  checkArraySizes(ok, map);
  assert.deepEqual(failures, []);
  map.world.levels[1].tiles.colors.pop();
  checkArraySizes(ok, map);
  assert.ok(failures.some((m) => /level 1: tiles size/.test(m)));
  for (const lv of Object.values(map.world.levels)) {
    lv.objects.push({ node_id: '1', position: 'Vector2( 0, 0 )' });
  }
  map.world.next_node_id = '2';
  checkNodes(ok, map, { S: 256, margin: 256 });
  assert.ok(failures.includes('duplicate node_id values'));
});

test('preview selects a level, skips its disabled terrain, and avoids output collisions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-levels-'));
  try {
    const { map } = serialiseMap(multi(), options());
    map.world.levels[0].terrain.splat = 'invalid terrain must not be read';
    map.world.levels[0].terrain.texture_1 = 'res://packs/missing/texture.png';
    map.world.levels[1].terrain.enabled = true;
    map.world.levels[1].terrain.texture_1 = 'res://packs/missing/texture.png';
    const file = writeMapFile(map, dir, 'sample');
    const first = renderMapPreview(file, { pps: 4 });
    assert.equal(first.file, path.join(dir, 'sample-preview.png'));
    const png = decodePng(fs.readFileSync(first.file));
    assert.equal(png.width ?? png.w, 8);
    assert.throws(() => renderMapPreview(file, { level: 1 }), /./);
    map.world.levels[1].terrain.enabled = false;
    writeMapFile(map, dir, 'sample');
    const second = renderMapPreview(file, { pps: 4, level: 1 });
    assert.equal(second.file, path.join(dir, 'sample-level-1-preview.png'));
    assert.throws(() => renderMapPreview(file, { level: 2 }), /Unknown map level/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
