import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ARTIFACTS_DIR, INDEX_DIR } from '../config.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, SHADOW_PATH_LAYER } from '../lib/shadows.mjs';
import { QUAY_SHADOW, WALL_SHADOW_INNER, WALL_SHADOW_OUTER, composeScene } from '../maps/dockyard-warehouse/scene.mjs';

const HTML = path.join(ARTIFACTS_DIR, 'dockyard-warehouse.html');
const haveInputs = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv')) && fs.existsSync(HTML);
const compose = (options) => composeScene(fs.readFileSync(HTML, 'utf8'), options);

test('Dockyard: wall, quay and prop shadows are composed on the shadow layer', { skip: !haveInputs }, () => {
  const scene = compose();
  assert.equal(scene.paths.length, scene.structure.shadowRuns.outer.length + scene.structure.shadowRuns.inner.length + 1);
  assert.ok(scene.paths.every((p) => /^BW_(Half|Full)_Shadow_/.test(p.name)), 'every path is a BW shadow');
  assert.ok(scene.paths.every((p) => p.layer === SHADOW_PATH_LAYER), 'paths sit on the shadow path layer');
  const propLayers = scene.objects.filter((o) => !/^BW_/.test(o.name) && o.layer < 600).map((o) => o.layer);
  assert.ok(SHADOW_PATH_LAYER >= Math.max(...propLayers) && SHADOW_PATH_LAYER < 600, 'shadow paths are above every prop and below the walls');
  assert.ok(SHADOW_PATH_LAYER > Math.max(...scene.patterns.map((p) => p.layer)), 'and above every pattern');
  assert.equal(scene.paths.filter((p) => p.name.startsWith(`BW_Half_Shadow_Large_${WALL_SHADOW_OUTER.strength}`)).length, scene.structure.shadowRuns.outer.length);
  assert.equal(scene.paths.filter((p) => p.name === `BW_Half_Shadow_Small_${WALL_SHADOW_INNER.strength}`).length, scene.structure.shadowRuns.inner.length);
  assert.equal(scene.paths.filter((p) => p.name === `BW_Half_Shadow_Large_${QUAY_SHADOW.strength}`).length, 1);
});

test('Dockyard: the quay shadow runs south along the first water column so its fade falls east onto the water', { skip: !haveInputs }, () => {
  const scene = compose();
  const quay = scene.paths.find((p) => p.name === `BW_Half_Shadow_Large_${QUAY_SHADOW.strength}`);
  assert.deepEqual(quay.points, [[4096, 0], [4096, 3584]]);
});

test('Dockyard: a circle goes under each tall stack and the ledger desk, exempt from the 0.8-1.2 scale rule', { skip: !haveInputs }, () => {
  const scene = compose();
  const circles = scene.objects.filter((o) => /^BW_Shadow_Circle_/.test(o.name));
  assert.equal(circles.length, 4, 'three tall stacks and the desk');
  assert.equal(scene.stats.propShadows, 4);
  assert.ok(circles.every((o) => o.layer === SHADOW_LAYER && o.rot === 0 && o.scale >= SHADOW_CIRCLE_SCALE && o.scale <= 2));
  assert.ok(scene.objects.filter((o) => !/^BW_/.test(o.name)).every((o) => o.scale >= 0.8 && o.scale <= 1.2), 'props keep rule 1');
});

test('Dockyard: adding shadows does not move the layout or the clutter count', { skip: !haveInputs }, () => {
  const scene = compose();
  const props = scene.objects.filter((o) => !/^BW_/.test(o.name));
  assert.equal(props.length, 209);
  assert.equal(scene.stats.clutter, 120);
  assert.deepEqual(compose().objects, scene.objects, 'same seed, same scene');
});

test('Dockyard: no ground pattern on a layer above the shadows overlaps one (it would bury it)', { skip: !haveInputs }, () => {
  // composeScene throws if one does; this pins that the default layout is clear of them
  assert.doesNotThrow(() => compose());
  const scene = compose();
  assert.ok(scene.patterns.some((p) => p.layer > SHADOW_LAYER), 'the top pattern tier exists, so the guard has something to check');
});
