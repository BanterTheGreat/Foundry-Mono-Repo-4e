import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkArraySizes, checkMappingRules, checkNodes, checkShadowTextures, checkStructure, createChecker, pool, poolLen, splitObjects, vec } from '../lib/map-checks.mjs';

const S = 256;
const bytes = (n, fill = 0) => `PoolByteArray( ${new Array(n).fill(fill).join(', ')} )`;
const BW_PATH = 'res://packs/IFGltsLb/textures/paths/BW_Half_Shadow_Large_075.png';
const BW_CIRCLE = 'res://packs/IFGltsLb/textures/objects/BW_Shadow_Circle_050.png';
const PROP = 'res://packs/AAAAAAAA/textures/objects/crate.png';

/** A minimal valid 2 x 2 map. Every record is overridable so one test breaks exactly one thing. */
function makeMap({ objects = [], paths = [], splatFirst = 255 } = {}) {
  const W = 2, H = 2, texels = W * 4 * H * 4;
  const splat = [];
  for (let i = 0; i < texels; i++) { splat.push(i === 0 ? splatFirst : 255, 0, 0, 0); }
  const cave = Math.floor(2 * W * H + 1.5 * (W + H) + 2);
  return {
    header: { asset_manifest: [] },
    world: {
      width: W, height: H, object_shadow: false, next_node_id: '20',
      levels: {
        0: {
          tiles: { cells: `PoolIntArray( ${new Array(W * H).fill(-1).join(', ')} )`, colors: new Array(W * H).fill('ffffffff') },
          terrain: { splat: `PoolByteArray( ${splat.join(', ')} )` },
          cave: { bitmap: bytes(cave), entrance_bitmap: bytes(cave) },
          shapes: { polygons: [], walls: [] },
          patterns: [], walls: [], paths, objects,
        },
      },
    },
  };
}
const object = (over = {}) => ({ position: 'Vector2( 40, 90 )', rotation: 0.3, scale: 'Vector2( 1, 1 )', shadow: false, texture: PROP, layer: 100, node_id: '1', ...over });
const shadowPath = (over = {}) => ({ texture: BW_PATH, layer: 400, node_id: '2', ...over });
const shadowCircle = (over = {}) => ({ position: 'Vector2( 300, 300 )', rotation: 0, scale: 'Vector2( 1.4, 1.4 )', shadow: false, texture: BW_CIRCLE, layer: -100, node_id: '3', ...over });

/** Run one check with a fresh counter and return the failure messages it printed. */
function failures(run) {
  const messages = [];
  const log = console.log;
  console.log = (_tag, msg) => { messages.push(String(msg)); };
  try {
    const c = createChecker();
    run(c.ok);
    return { messages, failed: c.failed() };
  } finally {
    console.log = log;
  }
}

test('vec, pool and poolLen read Godot value strings', () => {
  assert.deepEqual(vec('Vector2( 1.5, -2 )'), [1.5, -2]);
  assert.deepEqual(pool('PoolVector2Array( 0, 0, 10, 5 )'), [[0, 0], [10, 5]]);
  assert.equal(poolLen('PoolByteArray( 0, 0, 0 )'), 3);
});

test('createChecker counts passes and failures and reports them', () => {
  const c = createChecker();
  const saved = console.log;
  console.log = () => {};
  try {
    c.ok(true, 'fine');
    c.ok(false, 'broken');
    c.ok(1, 'truthy');
  } finally {
    console.log = saved;
  }
  assert.equal(c.failed(), 1);
  assert.equal(c.summary(), '2 checks passed, 1 failed.');
});

test('splitObjects separates BW shadow circles from props', () => {
  const lv = makeMap({ objects: [object(), shadowCircle()] }).world.levels[0];
  const { propObjects, shadowObjects } = splitObjects(lv);
  assert.equal(propObjects.length, 1);
  assert.equal(shadowObjects.length, 1);
});

test('checkArraySizes accepts a well-formed map and returns its sizes and terrain weights', () => {
  const map = makeMap();
  const out = failures((ok) => {
    const sized = checkArraySizes(ok, map);
    assert.equal(sized.W, 2);
    assert.equal(sized.H, 2);
    assert.equal(sized.caveLen, Math.floor(2 * 4 + 1.5 * 4 + 2));
    assert.equal(sized.splat.length, 2 * 4 * 2 * 4 * 4);
  });
  assert.equal(out.failed, 0);
});

test('checkArraySizes rejects terrain weights that do not sum to 255 and wrong array lengths', () => {
  assert.equal(failures((ok) => checkArraySizes(ok, makeMap({ splatFirst: 200 }))).failed, 1);
  const short = makeMap();
  short.world.levels[0].tiles.colors.pop();
  assert.equal(failures((ok) => checkArraySizes(ok, short)).failed, 1);
});

test('checkMappingRules passes a clean map', () => {
  const map = makeMap({ objects: [object(), shadowCircle()] });
  assert.equal(failures((ok) => checkMappingRules(ok, map, { S, caveLen: 16 })).failed, 0);
});

test('rule 1: a prop outside 0.8 to 1.2 fails, but a 1.4 shadow circle is exempt', () => {
  const big = makeMap({ objects: [object({ scale: 'Vector2( 2, 2 )' })] });
  assert.match(failures((ok) => checkMappingRules(ok, big, { S, caveLen: 16 })).messages.join('\n'), /rule 1: 1 objects/);
  const stretched = makeMap({ objects: [object({ scale: 'Vector2( 1, 1.1 )' })] });
  assert.equal(failures((ok) => checkMappingRules(ok, stretched, { S, caveLen: 16 })).failed, 1);
});

test('rule 2: object shadows must be off in the world and on every object', () => {
  const world = makeMap({ objects: [object()] });
  world.world.object_shadow = true;
  assert.match(failures((ok) => checkMappingRules(ok, world, { S, caveLen: 16 })).messages.join('\n'), /rule 2/);
  const each = makeMap({ objects: [object({ shadow: true })] });
  assert.match(failures((ok) => checkMappingRules(ok, each, { S, caveLen: 16 })).messages.join('\n'), /rule 2/);
});

test('rule 4: an unrotated prop on a square centre fails; a rotated or off-centre one passes', () => {
  const centred = makeMap({ objects: [object({ position: 'Vector2( 128, 128 )', rotation: 0 })] });
  assert.match(failures((ok) => checkMappingRules(ok, centred, { S, caveLen: 16 })).messages.join('\n'), /rule 4: 1 objects/);
  const another = makeMap({ objects: [object({ position: 'Vector2( 640, 384 )', rotation: 0 })] });
  assert.equal(failures((ok) => checkMappingRules(ok, another, { S, caveLen: 16 })).failed, 1);
  const rotated = makeMap({ objects: [object({ position: 'Vector2( 128, 128 )', rotation: 0.4 })] });
  assert.equal(failures((ok) => checkMappingRules(ok, rotated, { S, caveLen: 16 })).failed, 0);
  const corner = makeMap({ objects: [object({ position: 'Vector2( 256, 256 )', rotation: 0 })] });
  assert.equal(failures((ok) => checkMappingRules(ok, corner, { S, caveLen: 16 })).failed, 0, 'a grid corner is not a square centre');
  const negative = makeMap({ objects: [object({ position: 'Vector2( -128, 128 )', rotation: 0 })] });
  assert.equal(failures((ok) => checkMappingRules(ok, negative, { S, caveLen: 16 })).failed, 1, 'the padded border squares count too');
});

test('rule 6: cave data and building shapes must stay empty', () => {
  const cave = makeMap();
  cave.world.levels[0].cave.bitmap = bytes(16, 1);
  assert.match(failures((ok) => checkMappingRules(ok, cave, { S, caveLen: 16 })).messages.join('\n'), /cave tool data/);
  const shapes = makeMap();
  shapes.world.levels[0].shapes.polygons.push([]);
  assert.match(failures((ok) => checkMappingRules(ok, shapes, { S, caveLen: 16 })).messages.join('\n'), /building tool shapes/);
});

test('checkShadowTextures accepts BW paths on the given layer and circles scaled 1.3 to 2', () => {
  const map = makeMap({ paths: [shadowPath()], objects: [shadowCircle()] });
  let seen;
  const out = failures((ok) => { seen = checkShadowTextures(ok, map, { pathLayer: 400 }); });
  assert.equal(out.failed, 0);
  assert.equal(seen.shadowPaths.length, 1);
  assert.equal(seen.shadowObjects.length, 1);
});

test('checkShadowTextures rejects the wrong layer, a too-small circle and a foreign path', () => {
  const wrongLayer = makeMap({ paths: [shadowPath({ layer: -100 })] });
  assert.equal(failures((ok) => checkShadowTextures(ok, wrongLayer, { pathLayer: 400 })).failed, 1);
  const small = makeMap({ paths: [shadowPath()], objects: [shadowCircle({ scale: 'Vector2( 1, 1 )' })] });
  assert.equal(failures((ok) => checkShadowTextures(ok, small, { pathLayer: 400 })).failed, 1);
  const foreign = makeMap({ paths: [shadowPath(), { texture: 'res://packs/AAAAAAAA/textures/paths/stairs_5a.png', layer: 400, node_id: '9' }] });
  assert.equal(failures((ok) => checkShadowTextures(ok, foreign, { pathLayer: 400 })).failed, 1, 'a non-shadow path fails the every-path-is-a-shadow check');
  assert.equal(failures((ok) => checkShadowTextures(ok, foreign, { pathLayer: 400, onlyShadowPaths: false })).failed, 0, 'an outdoor map may have other paths');
});

test('checkNodes needs unique ids, a next id past the largest, and objects near the map', () => {
  const good = makeMap({ objects: [object({ node_id: 'a' }), object({ node_id: 'b' })] });
  assert.equal(failures((ok) => checkNodes(ok, good, { S, margin: 300 })).failed, 0);
  const dup = makeMap({ objects: [object({ node_id: 'a' }), object({ node_id: 'a' })] });
  assert.match(failures((ok) => checkNodes(ok, dup, { S, margin: 300 })).messages.join('\n'), /duplicate node_id/);
  const low = makeMap({ objects: [object({ node_id: 'ff' })] });
  assert.match(failures((ok) => checkNodes(ok, low, { S, margin: 300 })).messages.join('\n'), /next_node_id/);
  const far = makeMap({ objects: [object({ position: 'Vector2( 5000, 90 )' })] });
  assert.match(failures((ok) => checkNodes(ok, far, { S, margin: 300 })).messages.join('\n'), /far outside/);
  assert.equal(failures((ok) => checkNodes(ok, far, { S, margin: 5000 })).failed, 0, 'the margin is a parameter');
});

test('checkStructure compares keys and value kinds, and only the records a map actually has', () => {
  const ref = {
    mod: 1,
    header: { a: 1, creation_date: { y: 1 }, editor_state: { z: 1 } },
    world: { width: 1, levels: { 0: {
      environment: { e: 1 }, tiles: { t: 1 }, cave: { c: 1 }, terrain: { t: 1 }, roofs: { r: 1 }, water: { w: 1 }, shapes: { s: 1 },
      layers: { 100: 'a' }, walls: [], patterns: [], paths: [{ p: 1, layer: 1 }], objects: [{ o: 'x', custom_color: 'ffffffff' }],
    } } },
  };
  const clone = () => JSON.parse(JSON.stringify(ref));
  delete ref.mod;
  const ours = clone();
  ours.world.levels[0].objects = [{ o: 'y' }];
  assert.equal(failures((ok) => checkStructure(ok, ours, ref)).failed, 0, 'an outdoor map with no walls or patterns compares clean');
  const extra = clone();
  extra.world.levels[0].objects = [{ o: 'y', surprise: 1 }];
  assert.match(failures((ok) => checkStructure(ok, extra, ref)).messages.join('\n'), /object: keys differ/);
  const kind = clone();
  kind.world.levels[0].objects = [{ o: 5 }];
  assert.match(failures((ok) => checkStructure(ok, kind, ref)).messages.join('\n'), /value kind number vs real string/);
  const walled = clone();
  walled.world.levels[0].walls = [{ node_id: '1', portals: [] }];
  assert.match(failures((ok) => checkStructure(ok, walled, ref)).messages.join('\n'), /reference map has no wall/);
  const layers = clone();
  layers.world.levels[0].layers = { 100: 'a', 200: 'b' };
  assert.match(failures((ok) => checkStructure(ok, layers, ref)).messages.join('\n'), /layers table/);
});
