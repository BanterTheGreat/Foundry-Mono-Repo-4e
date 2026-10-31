import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INDEX_DIR, REPO_DIR } from '../config.mjs';
import { COLS, ROWS, S } from '../maps/grappa-safehouse-v2/grid.mjs';
import { CLUTTER_CUTS, GROUND_KEEP, LAYER, RUBBLE_KEEP, RUBBLE_NAME, composeScene } from '../maps/grappa-safehouse-v2/scene.mjs';

const DIR = path.join(REPO_DIR, 'output', 'encounters', 'grappav2');
const HTML_FILE = path.join(DIR, 'grappa-safehouse-v2.html');
const have = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv')) && fs.existsSync(HTML_FILE);
const html = have ? fs.readFileSync(HTML_FILE, 'utf8') : '';
const deployment = have ? JSON.parse(fs.readFileSync(path.join(DIR, 'grappa-safehouse-v2.json'), 'utf8')).deployment : [];
const scene = have ? composeScene(html, { deployment }) : null;
const isShadow = (o) => o.pack === '[BW] Baileywiki Shadows';

test('the scene covers the 20 x 16 map: encounter, corridor and street', { skip: !have }, () => {
  assert.deepEqual(scene.world, { cols: COLS, rows: ROWS, size: S });
  assert.equal(COLS, 20);
  assert.equal(ROWS, 16);
  assert.equal(scene.walls.length, 4, 'the building outline and three partitions');
  assert.equal(scene.walls.reduce((n, w) => n + w.openings.length, 0), 15);
  assert.equal(scene.terrain.splat.length, COLS * 4 * ROWS * 4 * 4);
  for (let i = 0; i < scene.terrain.splat.length; i += 4) {
    assert.equal(scene.terrain.splat[i] + scene.terrain.splat[i + 1] + scene.terrain.splat[i + 2] + scene.terrain.splat[i + 3], 255);
  }
});

test('doorways are the invisible portal, and the building outline is drawn after every partition', { skip: !have }, () => {
  assert.ok(scene.walls.flatMap((w) => w.openings).every((o) => o.pack === 'Interior' && o.rel === 'textures/portals/empty.png'));
  assert.equal(scene.walls.length, 4);
  assert.equal(scene.walls[scene.walls.length - 1].name, 'wall1a', 'the outline is last');
  assert.ok(scene.walls.slice(0, -1).every((w) => w.name === 'wood2a'));
  // the partition that ends on the dividing wall comes before it
  const index = (pred) => scene.walls.findIndex(pred);
  const vertical = index((w) => w.points[0][0] === 2560 && w.points[1][0] === 2560);
  const dividing = index((w) => w.points[0][1] === 2048 && w.points[1][1] === 2048);
  assert.ok(vertical >= 0 && dividing > vertical, 'the records/storeroom partition is drawn before the wall it runs into');
});

test('a thin line path lies across each doorway run, where one room floor meets the next', { skip: !have }, () => {
  const seams = scene.paths.filter((p) => p.role === 'seam');
  assert.equal(seams.length, 5, 'the records/storeroom doors, the two openings into the common room, the front doors and the rear doors');
  assert.ok(seams.every((p) => p.name === 'line' && p.width === 13 && p.layer === LAYER.seam && p.points.length === 2));
  // each run covers exactly its doorway: one 3-wide, one 3-wide, one 3-wide, one 4-wide and one 2-wide
  const lengths = seams.map(({ points: [a, b] }) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / S)).sort();
  assert.deepEqual(lengths, [2, 3, 3, 3, 4]);
  // on the wall line, and every doorway unit is covered
  for (const { points: [a, b] } of seams) { assert.ok(a[0] % S === 0 && a[1] % S === 0 && b[0] % S === 0 && b[1] % S === 0); }
  assert.equal(seams.reduce((n, { points: [a, b] }) => n + Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / S), 0), scene.structure.openings.length);
  assert.ok(LAYER.seam > -100 && LAYER.seam < 400, 'above the floor patterns, below the shadow paths');
});

test('mapping rule 1: every prop is scaled 0.8 to 1.2 and none is a colorable texture', { skip: !have }, () => {
  const props = scene.objects.filter((o) => !isShadow(o));
  assert.ok(props.length > 150);
  assert.ok(props.every((o) => o.scale >= 0.8 - 1e-9 && o.scale <= 1.2 + 1e-9), 'scale range');
  assert.ok(scene.objects.every((o) => !/x\.png$/.test(o.rel) || isShadow(o)), 'no colorable x-variants');
  const circles = scene.objects.filter(isShadow);
  assert.ok(circles.length >= 7 && circles.every((o) => o.scale >= 1.3 && o.scale <= 2 && o.layer === LAYER.shadow));
});

test('mapping rule 4: nothing sits on a square centre without a rotation', { skip: !have }, () => {
  const fromCentre = (v) => Math.abs((((v % S) + S) % S) - S / 2);
  const snapped = scene.objects.filter((o) => fromCentre(o.x) < 0.5 && fromCentre(o.y) < 0.5 && Math.abs(o.rot) < 1e-3);
  assert.equal(snapped.length, 0);
});

test('the standing clutter calibration is applied exactly, less what this map thins further (ground clutter, then rubble)', { skip: !have }, () => {
  const density = CLUTTER_CUTS.reduce((d, cut) => d * (1 - cut), 1);
  const ground = scene.stats.groundBefore - scene.stats.groundAfter, rubble = scene.stats.rubbleBefore - scene.stats.rubbleAfter;
  assert.equal(scene.stats.groundBefore, Math.round(scene.stats.clutterPlaced * density));
  assert.equal(scene.stats.clutter, scene.stats.groundBefore - ground - rubble);
  const uncut = composeScene(html, { deployment, clutterCuts: [], rubbleKeep: 1, groundKeep: { ordinary: 1, difficult: 1 } });
  assert.equal(uncut.stats.clutter, uncut.stats.clutterPlaced);
  assert.equal(uncut.stats.clutterPlaced, scene.stats.clutterPlaced, 'the cuts thin the layout, they do not change what is placed');
});

test('this map keeps a tenth of its ordinary ground clutter and all of its difficult-terrain clutter as before, and moves nothing else', { skip: !have }, () => {
  const full = composeScene(html, { deployment, groundKeep: { ordinary: 1, difficult: 1 }, rubbleKeep: 1 });
  const thinned = composeScene(html, { deployment, rubbleKeep: 1 });
  const ordinary = thinned.stats.ordinaryAfter / thinned.stats.ordinaryBefore;
  const difficultBefore = thinned.stats.groundBefore - thinned.stats.ordinaryBefore, difficultAfter = thinned.stats.groundAfter - thinned.stats.ordinaryAfter;
  assert.ok(Math.abs(ordinary - GROUND_KEEP.ordinary) < 0.02, `ordinary ground clutter keeps ${(ordinary * 100).toFixed(1)}%, expected ${GROUND_KEEP.ordinary * 100}%`);
  assert.equal(GROUND_KEEP.ordinary, 0.1);
  assert.equal(GROUND_KEEP.difficult, 0.7, 'the difficult-terrain clutter is exactly what it was before the ordinary floor was cut to a tenth');
  assert.equal(difficultAfter, Math.round(difficultBefore * 0.7));
  const props = (s) => s.objects.filter((o) => o.layer !== LAYER.clutter);
  assert.deepEqual(props(thinned), props(full), 'every prop, picture and shadow is exactly where it was');
  assert.deepEqual(thinned.paths, full.paths);
  const kept = new Set(thinned.objects.filter((o) => o.layer === LAYER.clutter).map((o) => JSON.stringify(o)));
  assert.ok(full.objects.filter((o) => o.layer === LAYER.clutter && kept.has(JSON.stringify(o))).length === kept.size, 'what stays is a subset of the full layout, in the same places');
});

test('this map keeps about half of its stone rubble, and thinning it moves nothing else', { skip: !have }, () => {
  // compared on the full ground layout, where there is rubble enough to thin (the ordinary floor is cut to a tenth in the real map)
  const fullGround = { ordinary: 1, difficult: 1 };
  const keepAll = composeScene(html, { deployment, groundKeep: fullGround, rubbleKeep: 1 });
  const thinned = composeScene(html, { deployment, groundKeep: fullGround });
  const rubble = (s) => s.objects.filter((o) => o.layer === LAYER.clutter && RUBBLE_NAME.test(o.name));
  assert.equal(RUBBLE_KEEP, 0.5);
  assert.ok(rubble(keepAll).length >= 8, 'there is rubble to thin');
  assert.equal(rubble(thinned).length, Math.round(rubble(keepAll).length * RUBBLE_KEEP));
  assert.equal(thinned.stats.rubbleAfter, rubble(thinned).length);
  const others = (s) => s.objects.filter((o) => !(o.layer === LAYER.clutter && RUBBLE_NAME.test(o.name)));
  assert.deepEqual(others(thinned), others(keepAll), 'every other object is exactly where it was');
  assert.deepEqual(thinned.paths, keepAll.paths);
});

test('shadows are composed last: changing the clutter cuts never moves a prop or a shadow', { skip: !have }, () => {
  const uncut = composeScene(html, { deployment, clutterCuts: [] });
  const bigProps = (s) => s.objects.filter((o) => o.layer !== LAYER.clutter);
  assert.deepEqual(bigProps(uncut), bigProps(scene));
  assert.deepEqual(uncut.paths, scene.paths);
});

test('difficult squares carry noticeably more clutter than ordinary floor', { skip: !have }, () => {
  const clutter = scene.objects.filter((o) => o.layer === LAYER.clutter);
  const count = (c, r) => clutter.filter((o) => Math.floor(o.x / S) + 1 === c && Math.floor(o.y / S) + 1 === r).length;
  const papers = [[6, 2], [7, 3], [6, 6], [7, 6], [6, 7], [14, 6], [5, 11], [10, 9], [10, 10]];
  const hard = papers.reduce((n, [c, r]) => n + count(c, r), 0) / papers.length;
  let plain = 0, squares = 0;
  for (let c = 1; c <= 16; c++) {
    for (let r = 1; r <= 14; r++) {
      if (!papers.some(([pc, pr]) => pc === c && pr === r)) { plain += count(c, r); squares++; }
    }
  }
  assert.ok(hard >= 2 * (plain / squares), `difficult ${hard}, ordinary ${plain / squares}`);
});

test('wall shadows fade into the rooms and the street, stop at doorways, and sit above the props', { skip: !have }, () => {
  const wall = scene.paths.filter((p) => p.role === 'wall');
  assert.equal(wall.length, scene.paths.length - scene.structure.seams.length, 'every other path is a doorway seam line');
  assert.ok(wall.every((p) => p.layer === LAYER.shadowPath && /^BW_Half_Shadow_(Small|Large)_050$/.test(p.name)));
  // every run fades to the left of travel, and the room it shades must be on that side
  let checked = 0;
  for (const line of scene.structure.lines) {
    for (const stretch of line.stretches) {
      for (const side of stretch.sides.filter((s) => s.area)) {
        const run = wall.find((p) => {
          const [p0, p1] = p.points;
          const sameLine = stretch.horizontal ? p0[1] === stretch.a[1] && p1[1] === stretch.a[1] : p0[0] === stretch.a[0] && p1[0] === stretch.a[0];
          const lo = stretch.horizontal ? Math.min(p0[0], p1[0]) : Math.min(p0[1], p1[1]);
          const hi = stretch.horizontal ? Math.max(p0[0], p1[0]) : Math.max(p0[1], p1[1]);
          const left = [p1[1] - p0[1], -(p1[0] - p0[0])];
          return sameLine && lo === stretch.from && hi === stretch.to && Math.sign(left[0]) === Math.sign(side.n[0]) && Math.sign(left[1]) === Math.sign(side.n[1]);
        });
        assert.ok(run, `no shadow for the ${side.area} face of a stretch ${stretch.a} to ${stretch.b}`);
        assert.match(run.name, line.outer && side.area === 'street' ? /Large/ : /Small/);
        checked++;
      }
    }
  }
  assert.ok(checked > 20);
  assert.equal(wall.length, checked, 'no shadow run beyond the stretches (so none across a doorway)');
  const propTop = Math.max(...scene.objects.filter((o) => !isShadow(o) && o.layer < 600).map((o) => o.layer));
  assert.ok(LAYER.shadowPath > propTop, 'shadow paths sit above every prop under the walls');
});

test('the scene dresses what the encounter describes', { skip: !have }, () => {
  const near = (re, x, y, r) => scene.objects.some((o) => re.test(o.name) && Math.hypot(o.x - x, o.y - y) < r);
  assert.ok(near(/^foodcart/, 6.5 * S, 4.5 * S, 60), "Grappa's trolley is on his square");
  assert.ok(near(/^caravan_3a/, 4096 + 2.45 * S, 3 * S, 80), 'the carriage waits in the street beside the rear doors');
  assert.ok(near(/^cabinet3a/, 640, 175, 60), 'the document cupboards stand along the north wall');
  assert.ok(near(/^broken_cabinet/, 2040, 500, 60), 'the toppled cupboard lies at (8-9,2-3)');
  assert.ok(near(/^bench_1a/, 780, 3980, 80), 'the corridor has its bench');
  assert.ok(scene.objects.filter((o) => o.layer === LAYER.lamp).length >= 10, 'wall lamps at the doorways and along the corridor');
});

test('bookcases and pictures hang flush on room walls, clear of doorways and of each other', { skip: !have }, () => {
  assert.ok(scene.stats.bookcases >= 3, `only ${scene.stats.bookcases} bookcases`);
  assert.ok(scene.stats.pictures >= 8, `only ${scene.stats.pictures} pictures`);
  const hung = scene.objects.filter((o) => /^(painting_wall|painting_upright|mirror_upright|wall_clock|poster_)/i.test(o.name) && o.layer === LAYER.onTop);
  const slabs = scene.objects.filter((o) => /^shelf_(2|4)[ab]$/.test(o.name) && o.layer === LAYER.furniture);
  assert.equal(slabs.length, scene.stats.bookcases);
  assert.ok(hung.length >= scene.stats.pictures - 1, 'every picture but the one on the floor is on a wall');
  // every hung piece is against a wall line, and never in a doorway
  const lines = scene.structure.lines;
  const toWall = (o) => Math.min(...lines.map((l) => (l.horizontal ? Math.abs(o.y - l.fixed) : Math.abs(o.x - l.fixed))));
  for (const o of [...hung, ...slabs]) {
    assert.ok(toWall(o) < 130, `${o.name} at (${o.x}, ${o.y}) is not against a wall`);
    for (const d of scene.structure.openings) {
      const along = d.horizontal ? Math.abs(o.x - d.x) : Math.abs(o.y - d.y), across = d.horizontal ? Math.abs(o.y - d.y) : Math.abs(o.x - d.x);
      assert.ok(!(along < 128 && across < 140), `${o.name} at (${o.x}, ${o.y}) is in a doorway`);
    }
  }
  // no two hung pieces overlap on a face
  const all = [...hung, ...slabs];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) > 90, `${all[i].name} and ${all[j].name} overlap`);
    }
  }
});
