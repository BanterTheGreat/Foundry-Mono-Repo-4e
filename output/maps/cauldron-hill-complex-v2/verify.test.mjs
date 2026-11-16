import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { layout, geometry, composeScene, COLS, ROWS, S, OUT } from './build.mjs';
import { REFERENCE_MAP } from '../../../src/dungeondraft-tools/config.mjs';
import { checkStructure, checkArraySizes, checkAssets, checkColorable, checkMappingRules, checkNodes, checkShadowTextures, checkWallOrder, pool, vec } from '../../../src/dungeondraft-tools/lib/map-checks.mjs';
import { findTexture } from '../../../src/dungeondraft-tools/lib/packs.mjs';

test('all areas 1-26, twelve VIP lodgings and five utility plants are represented', () => {
  const p = layout();
  const areas = new Set(p.rooms.map(r => r.area));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, ...Array.from({ length: 12 }, (_, i) => 15 + i)]) {
    assert(areas.has(String(n)), `Missing area ${n}`);
  }
  assert(p.rooms.some(r => r.id === '8'));
  assert.equal(p.rooms.filter(r => r.kind === 'freight').length, 4);
  assert.equal(p.rooms.filter(r => r.area === '4').length, 5);
  assert.equal(p.rooms.filter(r => r.kind === 'bunk').length, 12);
});

test('every opening cuts a real boundary and each room can reach its section entrance', () => {
  const p = layout(), g = geometry(p), graph = new Map(p.rooms.map(r => [r.id, new Set()]));
  const connect = (a, b) => { if (a && b && a !== b) { graph.get(a).add(b); graph.get(b).add(a); } };
  for (const e of g.edges.filter(e => e.door)) { connect(e.a, e.b); }
  // Neighbouring cells without a wall belong to open connected galleries or rail / water runs.
  const barriers = new Set(g.edges.map(e => e.id));
  for (const [key, a] of p.cells) {
    const [x, y] = key.split(',').map(Number);
    for (const [nx, ny, edge] of [[x + 1, y, `v:${x + 1},${y}`], [x, y + 1, `h:${x},${y + 1}`]]) {
      const b = p.cells.get(p.key(nx, ny));
      if (b && !barriers.has(edge)) { connect(a.id, b.id); }
    }
  }
  const seen = new Set(['approach', '10', 'dock-channel']);
  const queue = [...seen];
  while (queue.length) {
    for (const id of graph.get(queue.shift())) {
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  assert.deepEqual(p.rooms.filter(r => !seen.has(r.id)).map(r => r.id), []);
});

test('Borne battle has a 30-ft split bridge, control cabins, paired lifts and drop rails', () => {
  const scene = composeScene(), rooms = scene.plan.rooms;
  assert.equal(rooms.find(r => r.id === '8').h * 5, 30);
  assert.equal(rooms.filter(r => r.area === '8' && r.kind === 'control').length, 2);
  assert.equal(rooms.filter(r => r.kind === 'freight').length, 4);
  assert.equal(scene.paths.filter(p => p.role === 'bridge-split').length, 1);
  assert.equal(scene.paths.filter(p => p.role === 'restraint-chain').length, 4);
  assert(scene.paths.filter(p => p.role === 'safety-rail').length > 200);
  assert(scene.patterns.filter(p => p.role === 'borne').length >= 7);
});

test('floor polygons cover only their intended walkable cells, once each', () => {
  const p = layout(), g = geometry(p), scene = composeScene();
  const coverage = new Map();
  for (const pattern of scene.patterns.filter(p => p.role !== 'borne')) {
    const xs = pattern.points.map(q => q[0] / S), ys = pattern.points.map(q => q[1] / S);
    for (let y = Math.min(...ys); y < Math.max(...ys); y++) {
      for (let x = Math.min(...xs); x < Math.max(...xs); x++) {
        const k = p.key(x, y), room = p.cells.get(k);
        assert(room && !['water', 'pit'].includes(room.floor), `Floor extends into rock/water at ${k}`);
        coverage.set(k, (coverage.get(k) || 0) + 1);
      }
    }
  }
  for (const [k, r] of p.cells) { assert.equal(coverage.get(k) || 0, ['water', 'pit'].includes(r.floor) ? 0 : 1, k); }
  assert.equal(scene.stats.keptClutter, Math.round(scene.stats.placedClutter * .85 * .85));
  assert.equal(g.edges.filter(e => e.door).length, p.doors.size);
});

test('furniture leaves clear door landings on both sides, including barracks bunks and stores', () => {
  const scene = composeScene();
  for (const o of scene.objects.filter(o => o.layer === 300)) {
    const tex = findTexture(`${o.pack}:${o.name}:objects`), rot = o.rot;
    const hx = (Math.abs(Math.cos(rot)) * tex.w + Math.abs(Math.sin(rot)) * tex.h) * o.scale / (2 * S);
    const hy = (Math.abs(Math.sin(rot)) * tex.w + Math.abs(Math.cos(rot)) * tex.h) * o.scale / (2 * S);
    for (const d of scene.plan.doors.values()) {
      const cx = d.x + (d.axis === 'h' ? .5 : 0), cy = d.y + (d.axis === 'v' ? .5 : 0);
      const overlaps = Math.abs(o.x / S - cx) < hx + (d.axis === 'h' ? .475 : .645) && Math.abs(o.y / S - cy) < hy + (d.axis === 'h' ? .645 : .475);
      assert(!overlaps, `${o.name} blocks ${d.axis}:${d.x},${d.y}`);
    }
  }
});

test('export matches the real Dungeondraft format and every asset, wall, doorway and mapping rule', () => {
  const map = JSON.parse(fs.readFileSync(`${OUT}/cauldron-hill-complex-v2.dungeondraft_map`, 'utf8'));
  const ref = JSON.parse(fs.readFileSync(REFERENCE_MAP, 'utf8'));
  const failures = [], ok = (condition, message) => { if (!condition) { failures.push(message); } };
  checkStructure(ok, map, ref);
  const { caveLen } = checkArraySizes(ok, map);
  checkAssets(ok, map); checkColorable(ok, map); checkMappingRules(ok, map, { S, caveLen });
  checkNodes(ok, map, { S, margin: 0 }); checkShadowTextures(ok, map, { onlyShadowPaths: false, pathLayer: 400 });
  checkWallOrder(ok, map);
  assert.deepEqual(failures, []);
  assert.equal(map.world.width, COLS); assert.equal(map.world.height, ROWS);
  const walls = map.world.levels['0'].walls;
  for (const wall of walls) {
    const pts = pool(wall.points);
    assert(pts.flat().every(v => v % S === 0));
    for (const portal of wall.portals) { assert(portal.texture.endsWith('/empty.png')); }
  }
  const portals = walls.flatMap(w => w.portals).map(p => vec(p.position));
  assert.equal(portals.length, layout().doors.size);
  assert(map.world.levels['0'].paths.every(p => !/Half_Shadow|Full_Shadow/.test(p.texture)));
});
