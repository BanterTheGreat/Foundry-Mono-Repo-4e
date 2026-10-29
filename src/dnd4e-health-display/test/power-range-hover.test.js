import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const drawing = readFileSync(new URL("../scripts/power-activation/range-area-drawing.js", import.meta.url), "utf8").replace(/^export /gm, "");
const source = readFileSync(new URL("../scripts/power-activation/power-range-hover.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Host the real renderer with observable canvas and hook boundaries. */
function fixture(resolve = async () => ({ normal: 10, maximum: 10 })) {
	const rectangles = [];
	const objects = [];
	const hooks = new Map();
	let id = 0;
	class Graphics {
		constructor() { objects.push(this); }
		clear() { return this; }
		destroy() { this.destroyed = true; }
		lineStyle() { return this; }
		beginFill() { return this; }
		endFill() { return this; }
		moveTo() { return this; }
		lineTo() { return this; }
		drawRect(...args) { rectangles.push(args); return this; }
	}
	const actor = {};
	const token = { id: "npc", actor, x: 200, y: 300, w: 200, h: 100 };
	const item = { type: "power", actor, isOwner: true, system: { rangeType: "range" } };
	actor.items = new Map([["power", item]]);
	const canvas = { ready: true, grid: { isSquare: true, size: 100 }, stage: { scale: { x: 1 } },
		tokens: new Map([[token.id, token]]), scene: { tokenVision: false },
		dimensions: { sceneRect: { x: 0, y: 0, width: 5000, height: 5000 } },
		interface: { addChild: child => child } };
	const context = vm.createContext({ canvas, game: { user: { isGM: true } }, resolveRange: resolve,
		PIXI: { Graphics, Polygon: class {} },
		Hooks: {
			on(name, callback) { const key = ++id; hooks.set(key, { name, callback }); return key; },
			off(_name, key) { hooks.delete(key); },
		},
	});
	vm.runInContext(`${drawing}\n${source}\nglobalThis.api = { powerRangeHover, bindPowerRangeHover };`, context);
	return { ...context.api, actor, token, item, canvas, rectangles, objects, hooks,
		fire: name => [...hooks.values()].filter(h => h.name === name).forEach(h => h.callback()) };
}

test("Ranged 10 uses the targeting tint, token footprint and map mask, then destroys both graphics", async () => {
	const f = fixture();
	await f.powerRangeHover.show(f.item, f.token);
	assert.ok(f.rectangles.some(r => JSON.stringify(r) === JSON.stringify([-800, -700, 2200, 2100])));
	assert.equal(f.powerRangeHover.graphics.mask, f.powerRangeHover.rangeMask);
	const count = f.rectangles.length;
	f.token.x += 100;
	f.fire("refreshToken");
	assert.ok(f.rectangles.length > count);
	assert.ok(f.rectangles.some(r => r[0] === -700 && r[2] === 2200));
	f.powerRangeHover.clear();
	assert.ok(f.objects.every(g => g.destroyed));
	assert.equal(f.hooks.size, 0);
});

test("GM NPC hover without token sight has a map mask when scene token vision is enabled", async () => {
	const f = fixture();
	f.canvas.scene.tokenVision = true;
	await f.powerRangeHover.show(f.item, f.token);
	assert.ok(f.rectangles.some(r => JSON.stringify(r) === JSON.stringify([0, 0, 5000, 5000])));
	f.powerRangeHover.clear();
});

test("long range and area placement reuse the same renderer", async () => {
	for (const range of [{ normal: 5, maximum: 10 }, { shape: "rangeBurst", area: 2, normal: 10, maximum: 10 },
		{ shape: "closeBurst", area: 2, normal: 2, maximum: 2 }]) {
		const f = fixture(async () => range);
		await f.powerRangeHover.show(f.item, f.token);
		assert.ok(f.rectangles.some(r => r[2] === f.token.w + 2 * range.maximum * 100));
		f.powerRangeHover.clear();
	}
});

test("hover yields to targeting, rejects unsupported powers, and validates the scene token", async () => {
	const f = fixture();
	await f.powerRangeHover.show(f.item, f.token, () => true);
	assert.equal(f.objects.length, 0);
	for (const rangeType of ["personal", "special"]) {
		f.item.system.rangeType = rangeType;
		await f.powerRangeHover.show(f.item, f.token);
	}
	await f.powerRangeHover.show(undefined, f.token);
	f.item.system.rangeType = "range";
	f.canvas.tokens.clear();
	await f.powerRangeHover.show(f.item, f.token);
	assert.equal(f.objects.length, 0);
	assert.equal(f.hooks.size, 0);
});

test("leaving, switching powers and scene teardown cannot resurrect an async hover", async () => {
	const pending = [];
	const f = fixture(() => new Promise(resolve => pending.push(resolve)));
	const first = f.powerRangeHover.show(f.item, f.token);
	const second = f.powerRangeHover.show(f.item, f.token);
	pending[1]({ normal: 2, maximum: 2 });
	await second;
	pending[0]({ normal: 10, maximum: 10 });
	await first;
	assert.equal(f.powerRangeHover.range.normal, 2);
	f.powerRangeHover.clear();
	const third = f.powerRangeHover.show(f.item, f.token);
	f.fire("canvasTearDown");
	pending[2]({ normal: 10, maximum: 10 });
	await third;
	assert.equal(f.powerRangeHover.graphics, null);
	assert.equal(f.hooks.size, 0);
});

test("invalid formulas quietly clear hooks and blocking during resolution prevents drawing", async () => {
	const f = fixture(async () => { throw new Error("Invalid formula"); });
	await f.powerRangeHover.show(f.item, f.token);
	assert.equal(f.hooks.size, 0);
	let finish;
	let blocked = false;
	const g = fixture(() => new Promise(resolve => { finish = resolve; }));
	const promise = g.powerRangeHover.show(g.item, g.token, () => blocked);
	blocked = true;
	finish({ normal: 10, maximum: 10 });
	await promise;
	assert.equal(g.objects.length, 0);
	assert.equal(g.hooks.size, 0);
});

test("whole-row hover and focus bind correctly and dispose on rerender or close", async () => {
	const f = fixture();
	const listeners = new Map();
	const child = {};
	const row = { dataset: { itemId: "power" }, contains: target => target === child,
		addEventListener: (name, fn) => listeners.set(name, fn),
		removeEventListener: name => listeners.delete(name) };
	const cleanup = f.bindPowerRangeHover({ querySelectorAll: () => [row] }, f.actor, f.token, () => false);
	listeners.get("mouseenter")();
	await new Promise(setImmediate);
	assert.ok(f.powerRangeHover.graphics);
	listeners.get("focusout")({ relatedTarget: child });
	assert.ok(f.powerRangeHover.graphics);
	listeners.get("mouseleave")({ relatedTarget: null });
	assert.equal(f.powerRangeHover.graphics, null);
	listeners.get("focusin")();
	await new Promise(setImmediate);
	assert.ok(f.powerRangeHover.graphics);
	cleanup();
	assert.equal(f.powerRangeHover.graphics, null);
	assert.equal(f.hooks.size, 0);
	assert.equal(listeners.size, 0);
});
