import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ARTIFACTS_DIR, INDEX_DIR } from '../config.mjs';
import { pointInPolygon } from '../lib/geometry.mjs';
import { composeScene } from '../maps/dockyard-warehouse/scene.mjs';

const HTML = path.join(ARTIFACTS_DIR, 'dockyard-warehouse.html');
const haveInputs = fs.existsSync(path.join(INDEX_DIR, 'assets.tsv')) && fs.existsSync(HTML);
const scene = () => composeScene(fs.readFileSync(HTML, 'utf8'));

// The user's reading of the grid: a whole-square wall is walkable floor with a thin wall on its outer edge.

test('Dockyard: the plank floor continues under every wall square and doorway, and there is no masonry', { skip: !haveInputs }, () => {
  const { patterns, structure } = scene();
  assert.ok(patterns.every((p) => !/Stone_Sidewalk/i.test(p.name)), 'no masonry pattern');
  const planks = patterns.filter((p) => /planks_1b/i.test(p.name) && p.layer === -100).map((p) => p.points);
  for (const key of structure.floorCells) {
    const [c, r] = key.split(',').map(Number);
    const centre = [(c - 0.5) * 256, (r - 0.5) * 256];
    assert.equal(planks.filter((poly) => pointInPolygon(centre, poly)).length, 1, `square ${key} has exactly one plank floor`);
  }
  for (const key of structure.wallSquares) { assert.ok(structure.floorCells.has(key), `wall square ${key} is floor`); }
});

test('Dockyard: wall dressing stays flush and small, with no posts, buttresses or deep shelving', { skip: !haveInputs }, () => {
  const { objects } = scene();
  assert.ok(objects.every((o) => !/pillar_stone/i.test(o.name)), 'no stone posts or buttresses');
  assert.ok(objects.every((o) => !/Shelf_Wall_(Deep|Worn)$/i.test(o.name)), 'no deep wall shelving');
});

test('Dockyard: the wall squares are still dressed (lanterns, shallow shelves, corner cobwebs)', { skip: !haveInputs }, () => {
  const { objects, structure } = scene();
  const onBand = (o) => structure.band.some((b) => Math.abs(o.x - (b.c - 0.5) * 256) <= 128 && Math.abs(o.y - (b.r - 0.5) * 256) <= 128);
  const dressing = objects.filter((o) => /Lantern_Wall|Shelf_Wall|Wall_Shelf|web_0[36]/i.test(o.name) && onBand(o));
  assert.ok(dressing.length >= 20, `only ${dressing.length} wall-dressing props on the wall squares`);
  assert.equal(objects.filter((o) => /web_0[36]/i.test(o.name) && onBand(o)).length, 4, 'one cobweb in each building corner');
});
