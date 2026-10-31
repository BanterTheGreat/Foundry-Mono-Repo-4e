import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INDEX_DIR, REPO_DIR } from '../config.mjs';
import { CLIFF_SHADOW, composeScene } from '../maps/cloudwood-mole/scene.mjs';
import { BW_PACK_ID, SHADOW_CIRCLE_SCALE, SHADOW_LAYER, isShadowTexture, shadowCircleSpec, shadowPathSpec } from '../lib/shadows.mjs';

const HTML = path.join(REPO_DIR, 'output', 'encounters', 'cloudwood-mole.html');
const haveInputs = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv')) && fs.existsSync(HTML);

test('shadow specs name the BW textures and refuse unknown strengths', () => {
  assert.equal(shadowPathSpec(), '[BW] Baileywiki Shadows:BW_Half_Shadow_Large_075:paths');
  assert.equal(shadowPathSpec({ edge: 'full', size: 'small', strength: '025' }), '[BW] Baileywiki Shadows:BW_Full_Shadow_Small_025:paths');
  assert.equal(shadowCircleSpec('100'), '[BW] Baileywiki Shadows:BW_Shadow_Circle_100:objects');
  assert.throws(() => shadowPathSpec({ strength: '060' }), /strength/);
  assert.throws(() => shadowCircleSpec('1'), /strength/);
  assert.ok(isShadowTexture(`res://packs/${BW_PACK_ID}/textures/objects/BW_Shadow_Circle_050.png`));
  assert.ok(!isShadowTexture('res://packs/3nTAliog/textures/objects/log.png'));
});

test('Cloudwood: every cliff gets a reversed half shadow along its line, so the fade lands on the low ground', { skip: !haveInputs }, () => {
  const scene = composeScene(fs.readFileSync(HTML, 'utf8'));
  const cliffs = scene.paths.filter((p) => p.role === 'cliff');
  const shadows = scene.paths.filter((p) => p.role === 'shadow');
  assert.ok(cliffs.length > 0);
  assert.equal(shadows.length, cliffs.length);
  assert.equal(scene.stats.cliffShadows, cliffs.length);
  const expected = shadowPathSpec(CLIFF_SHADOW).split(':')[1];
  cliffs.forEach((cliff, i) => {
    const shadow = shadows[i];
    assert.equal(shadow.name, expected);
    assert.equal(shadow.layer, SHADOW_LAYER);
    assert.equal(shadow.width, 512, 'a large half shadow is drawn at its native 512 px thickness');
    assert.deepEqual(shadow.points, [...cliff.points].reverse(), 'the shadow runs the cliff line the other way');
    assert.ok(shadow.layer < cliff.layer, 'the shadow sits below the cliff strip');
  });
});

test('Cloudwood: the biggest props carry a circular shadow below everything, outside the prop scale range', { skip: !haveInputs }, () => {
  const scene = composeScene(fs.readFileSync(HTML, 'utf8'));
  const circles = scene.objects.filter((o) => /^BW_Shadow_Circle_/.test(o.name));
  const props = scene.objects.filter((o) => !/^BW_Shadow_Circle_/.test(o.name));
  assert.equal(circles.length, scene.stats.propShadows);
  assert.ok(circles.length >= 10, `expected a shadow per canopy, log, stone and the hearth, got ${circles.length}`);
  for (const c of circles) {
    assert.equal(c.layer, SHADOW_LAYER);
    assert.ok(c.scale >= SHADOW_CIRCLE_SCALE - 1e-9 && c.scale <= 2 + 1e-9, `circle scale ${c.scale}`);
    assert.ok(!/Colorable/i.test(c.name));
  }
  for (const needle of [/^log$/, /^firepit_/, /^tree_/]) {
    for (const prop of props.filter((o) => needle.test(o.name))) {
      assert.ok(circles.some((c) => Math.hypot(c.x - prop.x, c.y - prop.y) < 60), `${prop.name} at ${prop.x},${prop.y} has no shadow`);
    }
  }
  assert.ok(props.every((o) => o.scale >= 0.8 - 1e-9 && o.scale <= 1.2 + 1e-9), 'props still obey rule 1');
});

test('Cloudwood: the scene with shadows is deterministic for a seed', { skip: !haveInputs }, () => {
  const scene = composeScene(fs.readFileSync(HTML, 'utf8'));
  const again = composeScene(fs.readFileSync(HTML, 'utf8'));
  assert.deepEqual(scene.objects, again.objects, 'deterministic for a seed');
  const cliffPoints = scene.paths.filter((p) => p.role === 'cliff').map((p) => p.points);
  assert.deepEqual(again.paths.filter((p) => p.role === 'cliff').map((p) => p.points), cliffPoints);
});
