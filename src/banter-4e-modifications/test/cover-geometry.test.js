import test from "node:test";
import assert from "node:assert/strict";
import { calculateCover, crossesCreature, crossesWall } from "../scripts/modules/cover-preview/cover-geometry.js";

const attacker = { x: 0, y: 0, width: 100, height: 100 };
const target = { x: 300, y: 0, width: 100, height: 100 };
const calculate = (options = {}) => calculateCover({ attacker, target, gridSize: 100, ...options });

test("a clear shot has no penalty and four clear best-corner rays", () => {
  const result = calculate();
  assert.equal(result.kind, "clear");
  assert.equal(result.penalty, 0);
  assert.equal(result.rays.length, 4);
  assert.ok(result.rays.every(ray => !ray.blocked));
});

test("chooses a clear corner even when other attacker corners are obstructed", () => {
  const result = calculate({ walls: [[150, 0, 150, 30]] });
  assert.equal(result.kind, "clear");
  assert.equal(result.rays[0].start.y, 100);
});

test("partial obstruction grants cover and retains clear and blocked rays", () => {
  const result = calculate({ walls: [[200, -100, 200, 60]] });
  assert.equal(result.kind, "cover");
  assert.equal(result.penalty, -2);
  assert.ok(result.rays.some(ray => ray.blocked));
  assert.ok(result.rays.some(ray => !ray.blocked));
  for (const ray of result.rays) {
    assert.deepEqual(ray.blockingWalls, ray.blocked ? [0] : []);
    assert.deepEqual(ray.blockingCreatures, []);
  }
});

test("a wall between the footprints fully blocks the shot", () => {
  const result = calculate({ walls: [[200, -100, 200, 200]] });
  assert.equal(result.kind, "blocked");
  assert.equal(result.penalty, null);
  assert.ok(result.rays.every(ray => ray.blocked));
});

test("a narrow opening leaves one best-corner ray clear and grants superior cover", () => {
  const result = calculate({ walls: [[200, -100, 200, 5], [200, 35, 200, 200]] });
  assert.equal(result.kind, "superior");
  assert.equal(result.penalty, -5);
  assert.equal(result.rays.filter(ray => ray.blocked).length, 3);
});

test("a wall on the source or destination boundary cannot be bypassed by choosing that corner", () => {
  for (const x of [100, 300]) {
    assert.equal(calculate({ walls: [[x, -100, x, 200]] }).kind, "blocked");
  }
});

test("running along a wall stays clear", () => {
  assert.equal(calculate({ walls: [[0, 0, 400, 0]] }).kind, "clear");
  assert.equal(crossesWall({ x: 0, y: 0 }, { x: 400, y: 0 }, [100, 0, 300, 0]), false);
});

test("enemy footprints affect ranged only when supplied to the shared calculator", () => {
  const creatures = [{ x: 150, y: -50, width: 100, height: 100 }];
  assert.equal(calculate().kind, "clear");
  assert.equal(calculate({ creatures }).kind, "cover");
});

test("creature edges and point touches do not block a ray", () => {
  const creature = { x: 100, y: 0, width: 100, height: 100 };
  assert.equal(crossesCreature({ x: 0, y: 0 }, { x: 300, y: 0 }, creature), false);
  assert.equal(crossesCreature({ x: 0, y: 100 }, { x: 100, y: 0 }, creature), false);
  assert.equal(crossesCreature({ x: 0, y: 50 }, { x: 300, y: 50 }, creature), true);
});

test("large target footprints use the best occupied target square", () => {
  const result = calculate({
    target: { ...target, height: 200 },
    walls: [[200, -100, 200, 90]],
  });
  assert.equal(result.kind, "clear");
  assert.ok(result.rays.every(ray => ray.end.y >= 100));
});

test("rejects invalid grid sizes instead of entering a geometry loop", () => {
  for (const gridSize of [0, -1, NaN]) {
    assert.throws(() => calculate({ gridSize }), RangeError);
  }
});
