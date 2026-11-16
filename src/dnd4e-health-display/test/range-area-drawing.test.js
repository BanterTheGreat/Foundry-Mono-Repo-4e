import assert from "node:assert/strict";
import test from "node:test";
import { rangeAreaDrawing } from "../scripts/power-activation/range-area-drawing.js";

/** Capture grid geometry and fill without requiring a Foundry canvas. */
function render({ source = { x: 400, y: 400, w: 100, h: 100 }, range = { normal: 2, maximum: 2 }, distance = range.maximum, bounds = { x: 0, y: 0, width: 1000, height: 1000 }, size = 100 } = {}) {
 globalThis.canvas = { grid: { size }, dimensions: { sceneRect: bounds } };
 const rectangles = [], fills = [], radii = [], strokes = [];
 const graphics = {
  lineStyle(...args) { strokes.push(args); return this; },
  beginFill(...args) { fills.push(args); return this; },
  drawRoundedRect(x, y, w, h, radius) { rectangles.push([x, y, w, h]); radii.push(radius); return this; },
  endFill() { return this; },
 };
 rangeAreaDrawing.drawRangeBoundary.call({ source, range, graphics }, distance);
 return { rectangles, fills, radii, strokes };
}

test("range cells are centered 70%-size yellow squares at 35% opacity", () => {
 const f = render();
 assert.equal(f.rectangles.length, 100);
 assert.equal(f.fills.length, 4);
 assert.deepEqual(f.strokes.filter(([width]) => width > 0), [[1, 0xf5d787, .55]]);
 assert.ok(Math.abs(1 - Math.pow(1 - f.fills[0][1], 4) - .35) < 1e-10);
 assert.deepEqual(f.radii.slice(0, 25), Array(25).fill(8));
 assert.deepEqual(f.rectangles[0], [215, 215, 70, 70]);
 assert.deepEqual(f.rectangles[24], [615, 615, 70, 70]);
});

test("large alternate origins and long range draw each cell once through maximum reach", () => {
 const f = render({ source: { x: 350, y: 300, w: 200, h: 100 }, range: { normal: 1, maximum: 3 } });
 assert.equal(f.rectangles.length, 224);
 assert.equal(new Set(f.rectangles.map(r => r.join(','))).size, 224);
 assert.equal(render({ range: { normal: 1, maximum: 3 }, distance: 1 }).rectangles.length, 0);
});

test("cells stay on the offset map grid during movement and clip to map edges", () => {
 const f = render({ source: { x: 45, y: 70, w: 100, h: 100 }, bounds: { x: 20, y: 30, width: 500, height: 500 } });
 assert.ok(f.rectangles.filter((r, i) => i < f.rectangles.length / 4).every(([x, y, w, h]) => (x - 35) % 100 === 0 && (y - 45) % 100 === 0 && w === 70 && h === 70 && x >= 20 && y >= 30 && x + w <= 520 && y + h <= 530));
 const small = render({ source: { x: 200, y: 200, w: 50, h: 50 }, size: 50 });
 assert.deepEqual(small.rectangles[0], [107.5, 107.5, 35, 35]);
 assert.deepEqual(small.strokes.filter(([width]) => width > 0), [[.5, 0xf5d787, .55]]);
});
