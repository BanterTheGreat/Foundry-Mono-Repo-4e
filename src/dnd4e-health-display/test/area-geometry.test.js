import assert from "node:assert/strict";
import test from "node:test";
import { areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin } from "../scripts/power-activation/area-geometry.js";

const source = { x: 500, y: 500, w: 200, h: 200, actor: {}, visible: true, document: { disposition: 1 } };

test("close bursts expand the full caster footprint; area bursts expand a single origin square", () => {
	assert.deepEqual(areaRectangle(source, { shape: "closeBurst", area: 2 }, null, 100), { x: 300, y: 300, w: 600, h: 600 });
	assert.deepEqual(areaRectangle(source, { shape: "rangeBurst", area: 2 }, { x: 1000, y: 1000 }, 100), { x: 800, y: 800, w: 500, h: 500 });
	assert.equal(areaRectangle(source, { shape: "rangeBlast", area: 3 }, null, 100), null);
});

test("blast membership uses footprint intersection, including large creatures but excluding edge touches", () => {
	const bounds = areaRectangle(source, { shape: "rangeBlast", area: 3 }, { x: 1000, y: 1000 }, 100);
	assert.equal(intersectsArea({ x: 900, y: 900, w: 200, h: 200 }, bounds), true);
	assert.equal(intersectsArea({ x: 1300, y: 1000, w: 100, h: 100 }, bounds), false);
	assert.equal(intersectsArea({ x: 900, y: 900, w: 100, h: 100 }, bounds), false);
});

test("close blast snapping supports all sides and offset placements beside large casters", () => {
	for (const point of [{ x: 0, y: 600 }, { x: 1200, y: 600 }, { x: 600, y: 0 }, { x: 600, y: 1200 }, { x: 400, y: 900 }]) {
		const origin = closeBlastOrigin(source, point, 3, 100);
		const bounds = areaRectangle(source, { shape: "closeBlast", area: 3 }, origin, 100);
		assert.equal(intersectsArea(source, bounds), false);
		const horizontalEdge = (bounds.x + bounds.w === source.x || bounds.x === source.x + source.w)
			&& bounds.y < source.y + source.h && bounds.y + bounds.h > source.y;
		const verticalEdge = (bounds.y + bounds.h === source.y || bounds.y === source.y + source.h)
			&& bounds.x < source.x + source.w && bounds.x + bounds.w > source.x;
		assert.ok(horizontalEdge || verticalEdge);
	}
	assert.deepEqual(closeBlastOrigin(source, { x: 450, y: 850 }, 3, 100), { x: 300, y: 700 });
});

test("area blast range origin may be anywhere in the square, on either side of the caster", () => {
	const range = { shape: "rangeBlast", area: 3 };
	assert.deepEqual(areaRangeOrigin(source, range, { x: 100, y: 100 }, 100), { x: 300, y: 300 });
	assert.deepEqual(areaRangeOrigin(source, range, { x: 400, y: 100 }, 100), { x: 500, y: 300 });
	assert.deepEqual(areaRangeOrigin(source, range, { x: 800, y: 800 }, 100), { x: 800, y: 800 });
});

test("explicit filters handle allies, enemies, neutrals, hidden creatures and caster exclusion", () => {
	const target = disposition => ({ actor: {}, visible: true, document: { disposition } });
	const range = { shape: "closeBlast" };
	assert.equal(areaTargetAllowed(source, target(-1), range, { targetDisposition: "enemies" }), true);
	assert.equal(areaTargetAllowed(source, target(1), range, { targetDisposition: "enemies" }), false);
	assert.equal(areaTargetAllowed(source, target(0), range, { targetDisposition: "allies" }), false);
	assert.equal(areaTargetAllowed(source, target(0), range, { targetDisposition: "all" }), true);
	assert.equal(areaTargetAllowed(source, { ...target(-1), visible: false }, range, { targetDisposition: "all" }), false);
	assert.equal(areaTargetAllowed(source, source, { shape: "closeBurst" }, { includeCaster: false }), false);
	assert.equal(areaTargetAllowed(source, source, range, { includeCaster: true }), true);
	assert.equal(areaTargetAllowed(source, source, { shape: "closeBurst" }, { includeCaster: true }), true);
});
