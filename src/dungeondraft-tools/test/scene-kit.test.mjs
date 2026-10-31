import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INDEX_DIR } from '../config.mjs';
import { distToPolyline, distToSegment, seededRandom } from '../lib/geometry.mjs';
import { findTexture } from '../lib/packs.mjs';
import {
  CLUTTER_CUTS, CRATE_SPECS, SCALE_MAX, SCALE_MIN, WALL_LAMPS, applyClutterCuts, assertThemes, buildObject, circleShadows, clamp,
  makeFam, onWall, pathRecord, patternRecord, randomHelpers, shadowPathRecord, wallRecord,
} from '../lib/scene-kit.mjs';
import { SHADOW_CIRCLE_SCALE, SHADOW_LAYER, SHADOW_PATH_LAYER } from '../lib/shadows.mjs';
import * as cloudwood from '../maps/cloudwood-mole/scene.mjs';
import * as dockyard from '../maps/dockyard-warehouse/scene.mjs';
import * as grappa from '../maps/grappa-safehouse/scene.mjs';

const haveIndex = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv'));
const tex = (over = {}) => ({ pack: 'Seasons', rel: 'textures/objects/rock_stone_01.png', name: 'rock_stone_01', w: 200, h: 100, colorable: false, ...over });

test('every generator uses the one clutter calibration and the one scale range', () => {
  for (const scene of [cloudwood, dockyard, grappa]) {
    assert.equal(scene.CLUTTER_CUTS, CLUTTER_CUTS, 'the same array, so "another -15%" is one edit');
    assert.equal(scene.SCALE_MIN, SCALE_MIN);
    assert.equal(scene.SCALE_MAX, SCALE_MAX);
  }
  assert.deepEqual(CLUTTER_CUTS, [0.15, 0.15]);
  assert.equal(CLUTTER_CUTS.reduce((d, cut) => d * (1 - cut), 1).toFixed(4), '0.7225');
  assert.deepEqual([SCALE_MIN, SCALE_MAX], [0.8, 1.2]);
});

test('clamp keeps a value inside the range', () => {
  assert.deepEqual([clamp(5, 0, 3), clamp(-1, 0, 3), clamp(2, 0, 3)], [3, 0, 2]);
});

test('randomHelpers draw one number per call from the given stream', () => {
  const { rr, pick } = randomHelpers(seededRandom(7));
  const reference = seededRandom(7);
  const first = reference(), second = reference();
  assert.equal(rr(10, 20), 10 + 10 * first);
  assert.equal(pick(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd'][Math.floor(second * 4)]);
  const again = randomHelpers(seededRandom(7));
  assert.equal(again.rr(10, 20), 10 + 10 * first, 'a fresh helper on the same seed repeats');
});

test('buildObject rounds the record and returns the footprint radius', () => {
  const { object, radius } = buildObject(tex(), 10.04, 20.06, { scale: 1.0004, rot: 0.123456, mirror: true, layer: 200 });
  assert.deepEqual(object, { pack: 'Seasons', rel: 'textures/objects/rock_stone_01.png', name: 'rock_stone_01', x: 10, y: 20.1, scale: 1, rot: 0.1235, mirror: true, layer: 200 });
  assert.equal(radius, (200 * 1.0004) / 2, 'radius uses the unrounded scale and the longest side');
});

test('buildObject sizes by px but clamps into the allowed scale range', () => {
  assert.equal(buildObject(tex(), 0, 0, { px: 180, layer: 100 }).object.scale, 0.9);
  assert.equal(buildObject(tex(), 0, 0, { px: 20, layer: 100 }).object.scale, SCALE_MIN);
  assert.equal(buildObject(tex(), 0, 0, { px: 900, layer: 100 }).object.scale, SCALE_MAX);
});

test('mapping rule 1: an explicit scale outside 0.8-1.2 throws, and the edges are allowed', () => {
  assert.throws(() => buildObject(tex(), 0, 0, { scale: 1.3, layer: 100 }), /Rule 1: rock_stone_01 scale 1.300/);
  assert.throws(() => buildObject(tex(), 0, 0, { scale: 0.7, layer: 100 }), /Rule 1/);
  assert.doesNotThrow(() => buildObject(tex(), 0, 0, { scale: 0.8, layer: 100 }));
  assert.doesNotThrow(() => buildObject(tex(), 0, 0, { scale: 1.2, layer: 100 }));
});

test('a colorable texture is refused: placed untinted it renders raw red', () => {
  assert.throws(() => buildObject(tex({ colorable: true }), 0, 0, { scale: 1, layer: 100 }), /colorable texture/);
});

test('applyClutterCuts leaves exactly round(placed * density) clutter objects and touches nothing else', () => {
  const props = Array.from({ length: 30 }, (_, i) => ({ id: `prop${i}` }));
  const clutter = Array.from({ length: 200 }, (_, i) => ({ id: `clutter${i}` }));
  const objects = [...props, ...clutter];
  const kept = applyClutterCuts(objects, clutter, 20261031, CLUTTER_CUTS);
  const density = CLUTTER_CUTS.reduce((d, cut) => d * (1 - cut), 1); // compounded, so 0.72249999...: 200 pieces keep 144, not 145
  assert.equal(kept, Math.round(200 * density));
  assert.equal(kept, 144);
  assert.equal(objects.length, 30 + kept);
  assert.ok(props.every((p) => objects.includes(p)), 'props are never removed');
  assert.deepEqual(objects.filter((o) => o.id.startsWith('prop')), props, 'the survivors keep their order');
});

test('clutter cuts nest: a deeper cut removes a superset of a shallower one, and the same seed repeats', () => {
  const make = () => Array.from({ length: 120 }, (_, i) => ({ id: i }));
  const survivors = (cuts, seed = 5) => { const c = make(); const objs = [...c]; applyClutterCuts(objs, c, seed, cuts); return new Set(objs.map((o) => o.id)); };
  const shallow = survivors([0.15]), deep = survivors([0.15, 0.15]);
  assert.ok([...deep].every((id) => shallow.has(id)), 'what survives the deeper cut survived the shallower one');
  assert.ok(deep.size < shallow.size);
  assert.deepEqual([...survivors([0.15])], [...shallow]);
  assert.notDeepEqual([...survivors([0.15], 6)], [...shallow], 'another seed removes a different share');
  assert.equal(survivors([]).size, 120, 'no cuts removes nothing');
});

test('record builders write the shapes the map writer reads', () => {
  assert.deepEqual(patternRecord(tex(), [[0, 0], [1, 0]], -400), { pack: 'Seasons', rel: 'textures/objects/rock_stone_01.png', name: 'rock_stone_01', points: [[0, 0], [1, 0]], layer: -400 });
  assert.deepEqual(pathRecord(tex(), [[0, 0], [5, 0]], 256, 400, 'wall'), { pack: 'Seasons', rel: 'textures/objects/rock_stone_01.png', name: 'rock_stone_01', points: [[0, 0], [5, 0]], width: 256, layer: 400, role: 'wall' });
});

test('wallRecord takes its thickness from the texture and writes every opening as an open door', () => {
  const door = { pack: 'Buildings', rel: 'textures/portals/door.png' };
  const wall = wallRecord(tex({ h: 24 }), { loop: true, points: [[0, 0], [256, 0]], openings: [[128, 0], [200, 0]] }, door);
  assert.equal(wall.thickness, 24);
  assert.equal(wall.loop, true);
  assert.deepEqual(wall.openings, [{ x: 128, y: 0, pack: 'Buildings', rel: 'textures/portals/door.png', closed: false }, { x: 200, y: 0, pack: 'Buildings', rel: 'textures/portals/door.png', closed: false }]);
  assert.equal('id' in wall, false, 'no id key unless the wall has one');
  assert.equal(wallRecord(tex(), { id: 'outer', loop: false, points: [], openings: [] }, door).id, 'outer');
});

test('onWall steps in from the outer wall edge and along the wall, for each side', () => {
  const S = 256;
  // north wall of square (3, 2): the outward normal points up (-y); "along" runs east
  assert.deepEqual(onWall(S, { out: [0, -1], c: 3, r: 2 }, 40, 30), [2.5 * S + 30, 1.5 * S - (S / 2 - 40)].map((v, i) => (i === 0 ? v : v)));
  // south wall: outward +y, along runs west
  const [sx, sy] = onWall(S, { out: [0, 1], c: 3, r: 2 }, 40, 30);
  assert.equal(sx, 2.5 * S - 30);
  assert.equal(sy, 1.5 * S + (S / 2 - 40));
  // east wall: outward +x, along runs north-south
  const [ex, ey] = onWall(S, { out: [1, 0], c: 3, r: 2 }, 0, 10);
  assert.equal(ex, 2.5 * S + S / 2);
  assert.equal(ey, 1.5 * S + 10);
  // back = half a square reaches the square's centre line
  assert.deepEqual(onWall(S, { out: [0, -1], c: 1, r: 1 }, S / 2, 0), [S / 2, S / 2]);
});

test('assertThemes names the theme with an empty texture family', () => {
  assert.doesNotThrow(() => assertThemes({ stones: [[tex()], [tex()]] }));
  assert.throws(() => assertThemes({ stones: [[tex()]], soot: [[tex()], []] }), /Clutter theme soot has an empty texture family/);
});

test('circleShadows scales by prop size within 1.3 to 2, on the shadow layer, and jitters by at most 25 px', () => {
  const T = (spec) => ({ pack: 'BW', rel: `textures/objects/${spec}.png`, name: spec, w: 512, h: 512 });
  const casters = [{ x: 500, y: 600, size: 100, strength: '050' }, { x: 900, y: 100, size: 600, strength: '075' }, { x: 100, y: 100, size: 5000, strength: '100' }];
  const out = circleShadows(casters, { seed: 1, sizePerScale: 400, T });
  assert.deepEqual(out.map((c) => c.object.scale), [SHADOW_CIRCLE_SCALE, 1.5, 2]);
  assert.ok(out.every((c) => c.object.layer === SHADOW_LAYER && c.object.rot === 0 && c.object.mirror === false));
  assert.deepEqual(out.map((c) => c.object.name), ['[BW] Baileywiki Shadows:BW_Shadow_Circle_050:objects', '[BW] Baileywiki Shadows:BW_Shadow_Circle_075:objects', '[BW] Baileywiki Shadows:BW_Shadow_Circle_100:objects']);
  out.forEach((c, i) => {
    assert.ok(Math.abs(c.centre[0] - casters[i].x) <= 25 && Math.abs(c.centre[1] - casters[i].y) <= 25);
    assert.equal(c.radius, (512 * c.object.scale) / 2);
    assert.equal(c.object.x, +c.centre[0].toFixed(1));
  });
  assert.equal(circleShadows([casters[1]], { seed: 1, sizePerScale: 520, T })[0].object.scale, 1.3, 'the divisor is per map: 600 / 520 is 1.15, below the 1.3 floor');
});

test('circleShadows draws from its own stream: earlier circles never move when later casters are added', () => {
  const T = () => ({ pack: 'BW', rel: 'x.png', name: 'x', w: 512, h: 512 });
  const one = circleShadows([{ x: 300, y: 300, size: 400, strength: '050' }], { seed: 9, sizePerScale: 400, T });
  const three = circleShadows([{ x: 300, y: 300, size: 400, strength: '050' }, { x: 1, y: 1, size: 400, strength: '050' }, { x: 2, y: 2, size: 400, strength: '050' }], { seed: 9, sizePerScale: 400, T });
  assert.deepEqual(three[0], one[0]);
  const other = circleShadows([{ x: 300, y: 300, size: 400, strength: '050' }], { seed: 10, sizePerScale: 400, T });
  assert.notDeepEqual(other[0].centre, one[0].centre);
});

test('distToSegment and distToPolyline measure to the nearest point', () => {
  assert.equal(distToSegment(5, 3, [[0, 0], [10, 0]]), 3, 'beside the segment');
  assert.equal(distToSegment(-4, 3, [[0, 0], [10, 0]]), 5, 'beyond an end, measured to the endpoint');
  assert.equal(distToSegment(10, 0, [[0, 0], [10, 0]]), 0);
  const line = [[0, 0], [10, 0], [10, 10]];
  assert.equal(distToPolyline(13, 5, line), 3);
  assert.equal(distToPolyline(5, -2, line), 2);
  assert.equal(distToPolyline(0, 0, [[0, 0]]), Infinity, 'a single point has no segments');
});

test('makeFam keeps non-colorable members within the size bounds', { skip: !haveIndex }, () => {
  const fam = makeFam(200);
  const rocks = fam('Seasons', 'rock_stone');
  assert.ok(rocks.length > 0);
  assert.ok(rocks.every((m) => !m.colorable && Math.max(m.w, m.h) >= 30 && Math.max(m.w, m.h) <= 200));
  const wide = makeFam(400)('Seasons', 'rock_stone');
  assert.ok(wide.length >= rocks.length, 'a larger default maximum admits at least as many');
  assert.ok(fam('Seasons', 'rock_stone', { min: 100, max: 120 }).every((m) => Math.max(m.w, m.h) >= 100 && Math.max(m.w, m.h) <= 120));
  const named = makeFam(400)('Seasons', 'fern', { name: /a$/ });
  assert.ok(named.every((m) => /a$/.test(m.name)));
});

test('the shared texture lists all exist in the index', { skip: !haveIndex }, () => {
  for (const spec of [...CRATE_SPECS.base, ...CRATE_SPECS.mid, ...CRATE_SPECS.top, ...WALL_LAMPS]) {
    assert.doesNotThrow(() => findTexture(spec), spec);
  }
  assert.deepEqual(WALL_LAMPS.length, 2);
});

test('shadowPathRecord uses the BW texture, its height as width, the given layer and role', { skip: !haveIndex }, () => {
  const T = findTexture;
  const rec = shadowPathRecord(T, { edge: 'half', size: 'large', strength: '075' }, [[0, 0], [256, 0]], SHADOW_PATH_LAYER);
  assert.equal(rec.name, 'BW_Half_Shadow_Large_075');
  assert.equal(rec.width, 512);
  assert.equal(rec.layer, 400);
  assert.equal(rec.role, 'shadow');
  assert.equal(shadowPathRecord(T, { edge: 'half', size: 'small', strength: '050' }, [[0, 0], [1, 0]], SHADOW_LAYER, 'mass').width, 256);
  assert.equal(shadowPathRecord(T, { edge: 'half', size: 'small', strength: '050' }, [[0, 0], [1, 0]], SHADOW_LAYER, 'mass').role, 'mass');
});
