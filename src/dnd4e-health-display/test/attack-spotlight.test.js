import assert from "node:assert/strict";
import test from "node:test";
import { AttackSpotlight } from "../scripts/power-activation/attack-spotlight.js";

/** Exercise drawing and scene cutouts against a small canvas boundary. */
function fixture() {
	const calls = [];
	class Graphics {
		clear() { calls.length = 0; return this; }
		lineStyle() { return this; }
		drawEllipse(...args) { calls.push(["ring", ...args]); return this; }
		beginFill(...args) { calls.push(["fill", ...args]); return this; }
		endFill() { return this; }
		removeFromParent() { this.removed = true; }
		destroy() { this.destroyed = true; }
	}
	class PolygonTree {
		constructor(operations = []) { this.operations = operations; }
		intersectPolygon(polygon, { clipType }) {
			return new PolygonTree([...this.operations, { polygon, clipType }]);
		}
		drawShape() { calls.push(["shade", this.operations]); }
	}
	globalThis.PIXI = { Graphics, Polygon: class { constructor(points) { this.points = points; } },
		filters: { AlphaFilter: class {
			constructor(alpha) { this.alpha = alpha; }
			destroy() { this.destroyed = true; }
		} } };
	globalThis.foundry = { data: { PolygonTree } };
	globalThis.ClipperLib = { ClipType: { ctUnion: 1, ctDifference: 2 } };
	const token = (id, x, y = 0) => ({ id, x, y, w: 100, h: 100, visible: true, mesh: { filters: null, alpha: 0.7 } });
	const source = token("source", 0);
	const first = token("first", 400);
	const second = token("second", 0, 400);
	const other = token("other", 600, 500);
	const tokens = [source, first, second, other];
	globalThis.canvas = { ready: true, dimensions: { rect: { x: -100, y: -100, width: 2000, height: 1500 } },
		tokens: { get: id => tokens.find(t => t.id === id), placeables: tokens },
		interface: { addChild: graphics => graphics } };
	const session = { state: "reviewingResults", source, targets: [first, second], item: { system: { rangeType: "range" } } };
	return { spotlight: new AttackSpotlight(), session, source, first, second, other, tokens, calls };
}

test("spotlight shades the complete scene once and cuts out the origin and every target", () => {
	const f = fixture();
	const existing = {};
	f.other.mesh.filters = [existing];
	f.spotlight.update(f.session);
	assert.equal(f.calls.filter(c => c[0] === "ring").length, 6);
	assert.deepEqual(f.calls.find(c => c[0] === "fill"), ["fill", 0x000000, 0.35]);
	const operations = f.calls.find(c => c[0] === "shade")[1];
	assert.equal(operations.length, 4);
	assert.deepEqual(operations[0].polygon.points, [-100, -100, 1900, -100, 1900, 1400, -100, 1400]);
	assert.equal(operations[0].clipType, ClipperLib.ClipType.ctUnion);
	assert.ok(operations.slice(1).every(op => op.clipType === ClipperLib.ClipType.ctDifference));
	assert.equal(operations[2].polygon.points.length, 128);
	assert.deepEqual(operations[2].polygon.points.slice(0, 2), [505, 50]);
	assert.equal(f.other.mesh.alpha, 0.7);
	assert.equal(f.other.mesh.filters[0], existing);
	assert.equal(f.other.mesh.filters[1].alpha, 0.85);
	assert.equal(f.first.mesh.filters, null);
	f.spotlight.update(f.session);
	assert.equal(f.other.mesh.filters.length, 2, "refresh must not compound transparency");
	assert.equal(f.calls.filter(c => c[0] === "shade").length, 1);
	const graphics = f.spotlight.graphics;
	f.spotlight.clear();
	assert.deepEqual(f.other.mesh.filters, [existing]);
	assert.equal(graphics.removed, true);
	assert.equal(graphics.destroyed, true);
	f.spotlight.clear();
});

test("transparency follows selection changes and preserves concurrent effects on cleanup", () => {
	const f = fixture();
	f.spotlight.update(f.session);
	const filter = f.other.mesh.filters[0];
	const concurrent = {};
	f.other.mesh.filters.push(concurrent);
	f.session.targets.push(f.other);
	f.spotlight.update(f.session);
	assert.deepEqual(f.other.mesh.filters, [concurrent]);
	assert.equal(filter.destroyed, true);
	f.session.targets = [f.other];
	f.spotlight.update(f.session);
	assert.equal(f.first.mesh.filters[0].alpha, 0.85);
	f.session.state = "closed";
	f.spotlight.update(f.session);
	assert.deepEqual(f.first.mesh.filters, []);
	assert.deepEqual(f.other.mesh.filters, [concurrent]);
	assert.equal(f.spotlight.faded.size, 0);
});

test("all range types use shading without drawing arrows", () => {
	for (const rangeType of ["range", "weapon", "melee", "touch", "reach", "rangeBurst", "rangeBlast", "closeBurst", "closeBlast", "wall"]) {
		const f = fixture();
		f.session.item.system.rangeType = rangeType;
		// Graphics deliberately offers no lineTo/drawPolygon arrow API.
		f.spotlight.update(f.session);
		assert.equal(f.calls.filter(c => c[0] === "shade").length, 1, rangeType);
		f.spotlight.clear();
	}
});

test("targeting and closed states remove the shade; complete retains it until closed", () => {
	const f = fixture();
	for (const state of ["targeting", "updatingVariant", "attackDialog", "rollingAttack", "reviewingResults", "rollingDamage", "reviewingHealing", "complete", "closed"]) {
		f.session.state = state;
		f.spotlight.update(f.session);
		assert.equal(Boolean(f.spotlight.graphics), !["targeting", "updatingVariant", "closed"].includes(state), state);
	}
});

test("movement, removed targets, hidden tokens and scene teardown update or remove the cutouts", () => {
	const f = fixture();
	f.first.x = 500;
	f.first.w = 200;
	f.spotlight.update(f.session);
	const points = f.calls.find(c => c[0] === "shade")[1][2].polygon.points;
	assert.deepEqual(points.slice(0, 2), [705, 50]);
	assert.equal(Math.min(...points.filter((_, index) => index % 2 === 0)), 495);
	assert.equal(Math.min(...points.filter((_, index) => index % 2 === 1)), -5);
	f.session.targets = [f.second];
	f.spotlight.update(f.session);
	assert.equal(f.calls.find(c => c[0] === "shade")[1].length, 3);
	f.second.visible = false;
	f.spotlight.update(f.session);
	assert.equal(f.spotlight.graphics, null);
	f.second.visible = true;
	f.spotlight.update(f.session);
	canvas.ready = false;
	f.spotlight.update(f.session);
	assert.equal(f.spotlight.graphics, null);
});

test("self targeting is deduplicated and overlapping footprints use sequential subtraction", () => {
	const f = fixture();
	f.first.x = 50;
	f.session.targets = [f.source, f.first];
	f.spotlight.update(f.session);
	const operations = f.calls.find(c => c[0] === "shade")[1];
	assert.equal(operations.length, 3);
	assert.ok(operations.slice(1).every(op => op.clipType === ClipperLib.ClipType.ctDifference));
	f.spotlight.clear();
});

test("spotlight cutouts follow round token outlines rather than exposing square corners", () => {
	const f = fixture();
	f.spotlight.update(f.session);
	const points = f.calls.find(c => c[0] === "shade")[1][1].polygon.points;
	assert.ok(points.length > 8, "round cutout needs more than four corners");
	for (let i = 0; i < points.length; i += 2) {
		assert.ok(Math.hypot(points[i] - 50, points[i + 1] - 50) <= 58.01,
			"cutout must stay within the highlighted circle");
	}
	f.spotlight.clear();
});

test("spotlight shade renders above the token interface layer", () => {
	const f = fixture();
	canvas.tokens.zIndex = 100;
	canvas.interface.children = [canvas.tokens];
	f.spotlight.update(f.session);
	assert.ok(f.spotlight.graphics.zIndex > canvas.tokens.zIndex,
		"shade must cover tokens rendered by the interface layer too");
	f.spotlight.clear();
});
