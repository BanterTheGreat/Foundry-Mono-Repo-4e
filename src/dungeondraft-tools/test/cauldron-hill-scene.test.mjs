import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_DIR } from '../config.mjs';
import { CLUTTER_CUTS, composeScene } from '../maps/cauldron-hill-entrance/scene.mjs';

const HTML_FILE = path.join(REPO_DIR, 'output', 'maps', 'cauldron-hill-entrance.html');
const have = fs.existsSync(HTML_FILE);
const html = have ? fs.readFileSync(HTML_FILE, 'utf8') : '';
const scene = have ? composeScene(html) : null;

test('composing is deterministic for a seed and different for another', { skip: !have }, () => {
  const again = composeScene(html);
  assert.deepEqual(again.objects, scene.objects);
  assert.deepEqual(again.paths, scene.paths);
  assert.notDeepEqual(composeScene(html, { seed: 7 }).objects.map((o) => o.x), scene.objects.map((o) => o.x));
});

test('rule 1: every prop is scaled 0.8 to 1.2; the shadow circles are exempt', { skip: !have }, () => {
  for (const o of scene.objects) {
    if (/BW_Shadow_Circle/.test(o.name)) { assert.ok(o.scale >= 1.3 && o.scale <= 2, `${o.name} ${o.scale}`); continue; }
    assert.ok(o.scale >= 0.8 - 1e-9 && o.scale <= 1.2 + 1e-9, `${o.name} scale ${o.scale}`);
  }
});

test('rule 6: floors are patterns, walls are placed walls, doorways are the empty portal', { skip: !have }, () => {
  assert.ok(scene.patterns.length >= 4);
  assert.equal(scene.walls.length, 8);
  const openings = scene.walls.flatMap((w) => w.openings);
  assert.equal(openings.length, 11, 'four gate squares, two interior doors, five shack doorways and gaps');
  assert.ok(openings.every((o) => /empty.png$/.test(o.rel)));
});

test('rule 7: eight cliff strips, two worn ascents and two rail lines', { skip: !have }, () => {
  assert.equal(scene.paths.filter((p) => p.role === 'cliff').length, 8);
  assert.equal(scene.paths.filter((p) => p.role === 'ramp').length, 2);
  assert.equal(scene.paths.filter((p) => p.role === 'rails').length, 2);
});

test('clutter follows the standing calibration and every tree square has a canopy and a circle shadow', { skip: !have }, () => {
  const density = CLUTTER_CUTS.reduce((d, cut) => d * (1 - cut), 1);
  assert.equal(scene.stats.clutter, Math.round(scene.stats.clutterPlaced * density));
  const canopies = scene.objects.filter((o) => o.layer === 700 && /dead_tree/.test(o.name));
  assert.equal(canopies.length, 34);
  const circles = scene.objects.filter((o) => /BW_Shadow_Circle/.test(o.name));
  assert.ok(circles.length >= canopies.length);
});

test('no shadow paths are generated: the user places those by hand, only circles under big props remain', { skip: !have }, () => {
  assert.ok(scene.paths.every((p) => !/BW_/.test(p.name)));
  assert.ok(scene.objects.every((o) => o.layer !== 400), 'no prop sits on the old shadow path layer');
});
