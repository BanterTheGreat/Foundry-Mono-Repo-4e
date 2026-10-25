import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { automationConfig, squareDistance, selectionProblems, MODULE_ID, SETTING } from "../scripts/power-activation/rules.js";

const source = readFileSync(new URL("../scripts/power-activation/power-activation.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Run the real session controller against document/canvas boundaries, without Foundry. */
function fixture({ confirm = true, fastForward = false } = {}) {
	const targets = new Set();
	const messages = new Map();
	const warnings = [];
	const confirmations = [];
	const hooks = [];
	const changes = [];
	const rectangles = [];
	const shapes = [];
	class PolygonTree {
		constructor(shapes = []) { this.shapes = shapes; }
		intersectPolygon(polygon, { clipType } = {}) {
			if (clipType === 1) {
				return new PolygonTree([...this.shapes, ...polygon.fragments]);
			}
			return new PolygonTree(this.shapes.flatMap(shape => shape.intersections?.[polygon.name] ?? [shape]));
		}
		drawShape(graphics) { this.shapes.forEach(shape => graphics.drawShape(shape)); }
	}
	let consumed = 0;
	const actor = { uuid: "Actor.a", isOwner: true, toObject: () => ({ id: "a" }) };
	const item = {
		id: "p", uuid: "Actor.a.Item.p", name: "Test attack", actor, isOwner: true, hasAttack: true,
		system: { uses: { per: "encounter", value: 2 }, rangeType: "melee", macros: [] },
		getFlag: () => ({ enabled: true, targetCount: 1 }),
		toObject: () => ({ uses: item.system.uses.value }),
		update: async data => { changes.push(data); item.system.uses.value = data["system.uses.value"]; },
	};
	const token = (id, x) => ({
		id, name: id, actor, x, y: 0, w: 100, h: 100, visible: true,
		document: { elevation: 0, toObject: () => ({ id, x }) },
		setTarget(selected) { selected ? targets.add(this) : targets.delete(this); },
	});
	const attacker = token("source", 0);
	const target = token("target", 100);
	const far = token("far", 1000);
	const tokenMap = new Map([attacker, target, far].map(t => [t.id, t]));
	const graphics = {
		clear() {}, destroy() {}, addChild(child) { return child; },
		moveTo() { return this; }, lineTo() { return this; },
		lineStyle() { return this; }, beginFill() { return this; },
		drawShape(shape) { shapes.push(shape); return this; },
		drawRect(...rectangle) { rectangles.push(rectangle); return this; }, endFill() { return this; },
	};
	class App {
		render() { return this; }
		async close() {}
	}
	const context = vm.createContext({
		console, AbortController, MODULE_ID, SETTING, automationConfig, selectionProblems,
		CoverPreview: { setContext: value => hooks.push(["coverContext", value]), register() {} },
		foundry: {
			data: { PolygonTree },
			applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base, DialogV2: {
				confirm: async options => { confirmations.push(options); return confirm; },
			} } },
			utils: { randomID: () => "session" },
		},
		Handlebars: { escapeExpression: value => value },
		game: {
			user: { id: "user", targets }, messages,
			settings: { get: (module, key) => key === SETTING || (key === "fastFowardSettings" && fastForward) },
		},
		canvas: {
			stage: { scale: { x: 1 } },
			ready: true, grid: { isSquare: true, size: 100 },
			tokens: { get: id => tokenMap.get(id), placeables: [...tokenMap.values()] },
			interface: { addChild: () => graphics }, app: { canvas: { addEventListener() {} } },
		},
		PIXI: {
			Polygon: class { constructor(points) { this.points = points; this.name = "map"; } },
			Graphics: class { constructor() { return graphics; } },
			Text: class {
				constructor() { this.width = 100; this.scale = { set() {} }; this.position = { set() {} }; }
			},
		},
		window: { addEventListener() {}, setTimeout, clearTimeout },
		ClipperLib: { ClipType: { ctUnion: 1 } },
		ui: { notifications: { warn: message => warnings.push(message), error: message => warnings.push(message) } },
		Hooks: { callAll: (...args) => hooks.push(args) },
		ChatMessage: { getSpeaker: () => ({ actor: "a" }) },
		loadSystem: async () => ({ tokenForActor: () => attacker }),
		resolveRange: async () => ({ normal: 1, maximum: 1 }),
		registerAutomationTab: async () => {},
		renderPowerCard: async () => "power-card",
		createPowerMessage: async () => {
			const message = {
				id: "preview", canUserModify: () => true,
				async delete() { messages.delete(this.id); },
				async update(data) { Object.assign(this, data); },
			};
			messages.set(message.id, message);
			return message;
		},
		commitCardCosts: async () => { consumed++; return true; },
		commitPowerUse: async power => power.update({ "system.uses.value": power.system.uses.value - 1 }),
	});
	vm.runInContext(`${source}\nglobalThis.api = { ActivationSession, useAbility, showPowerInChat, setSession: value => { session = value; } };`, context);
	const activation = new context.api.ActivationSession(item, attacker, { normal: 1, maximum: 1 }, "card", 1);
	context.api.setSession(activation);
	return { context, activation, item, target, far, attacker, targets, messages, warnings, confirmations, hooks, changes, rectangles, shapes, tokenMap, consumed: () => consumed };
}

test("range mask excludes padding even when scene token vision is disabled", () => {
	const f = fixture();
	f.context.canvas.dimensions = { sceneRect: { x: 200, y: 300, width: 900, height: 700 } };
	f.context.canvas.scene = { tokenVision: false };
	f.activation.drawRange();
	assert.deepEqual(f.rectangles[0], [200, 300, 900, 700]);
	assert.equal(f.activation.graphics.mask, f.activation.rangeMask);
});

test("range mask preserves disconnected visible patches to both sides of the attacker", () => {
	const f = fixture();
	f.context.canvas.dimensions = { sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } };
	f.context.canvas.scene = { tokenVision: true };
	const left = { name: "left" };
	const right = { name: "right" };
	const sight = { name: "sight" };
	const polygon = fragments => ({
		points: [0, 0, 100, 0, 0, 100], fragments,
		// Legacy single-polygon helpers discard the disconnected left patch.
		intersectRectangle() { return fragments[0]; },
		intersectPolygon() { return polygon([right]); },
	});
	const perception = { name: "perception" };
	f.attacker.vision = { active: true, shape: polygon([sight]), light: perception, visionMode: { perceivesLight: true } };
	f.context.canvas.effects = { lightSources: new Map([
		["lamp", { active: true, shape: polygon([{ intersections: { perception: [right, left] } }]) }],
		["off", { active: false, shape: {} }],
	]) };
	f.activation.drawRange();
	assert.deepEqual(f.shapes, [sight, right, left]);
	f.shapes.length = 0;
	f.attacker.vision.active = false;
	f.activation.drawRange();
	assert.deepEqual(f.shapes, []);
});

for (const globalEnabled of [false, true]) {
	for (const powerEnabled of [false, true]) {
		test(`Send to Chat preserves normal usage unless targeting is active (global=${globalEnabled}, power=${powerEnabled})`, async () => {
			const f = fixture();
			f.context.game.settings.get = () => globalEnabled;
			f.item.getFlag = () => ({ enabled: powerEnabled, targetCount: 1 });
			let uses = 0;
			f.item.actor.usePower = async item => {
				assert.equal(item, f.item);
				uses++;
				item.system.uses.value--;
				return "normal-card";
			};
			await f.context.api.showPowerInChat(f.item);
			const automated = globalEnabled && powerEnabled;
			assert.equal(uses, automated ? 0 : 1);
			assert.equal(f.item.system.uses.value, automated ? 2 : 1);
			assert.equal(f.messages.size, automated ? 1 : 0);
		});
	}
}

test("range square follows interpolated source movement without rebuilding the panel each frame", async () => {
	const f = fixture();
	await f.activation.start();
	let renders = 0;
	f.activation.panel.render = () => { renders++; };
	f.attacker.x = 45;
	f.attacker.y = 70;
	f.activation.refreshMovingToken(f.attacker);
	assert.ok(f.rectangles.some(rectangle => JSON.stringify(rectangle) === JSON.stringify([-55, -30, 300, 300])));
	assert.equal(renders, 0);
	await f.activation.cancel();
	const count = f.rectangles.length;
	f.activation.refreshMovingToken(f.attacker);
	assert.equal(f.rectangles.length, count);
});

test("range overlay has no labels and clears during native attack handoff", () => {
	const f = fixture();
	f.context.PIXI.Text = class { constructor() { assert.fail("Range labels should not be created"); } };
	f.activation.range = { normal: 4, maximum: 8 };
	f.activation.drawRange();
	f.rectangles.length = 0;
	f.activation.busy = true;
	f.activation.drawRange();
	assert.equal(f.rectangles.length, 0);
});

test("footprint distance includes diagonals and large targets at the exact boundary", () => {
	const source = { x: 0, y: 0, w: 200, h: 200 };
	assert.equal(squareDistance(source, { x: 300, y: 300, w: 200, h: 200 }, 100), 2);
	assert.equal(squareDistance(source, { x: -200, y: 0, w: 100, h: 100 }, 100), 2);
});

test("selection reports both extra targets and out-of-range tokens", () => {
	const f = fixture();
	const problems = selectionProblems(f.attacker, [f.target, f.far], { maximum: 1 }, 1, 100);
	assert.equal(problems.length, 2);
	assert.match(problems[0], /Selected 2/);
	assert.match(problems[1], /far/);
});

test("Cancel deletes only the provisional card, restores targets, and spends nothing", async () => {
	const f = fixture();
	f.targets.add(f.target);
	f.activation.previousTargets = [f.target];
	f.messages.set("show-in-chat", { id: "show-in-chat" });
	await f.activation.start();
	assert.equal(f.targets.size, 0);
	await f.activation.cancel();
	assert.deepEqual([...f.messages.keys()], ["show-in-chat"]);
	assert.equal(f.targets.has(f.target), true);
	assert.equal(f.item.system.uses.value, 2);
	assert.equal(f.consumed(), 0);
});

test("invalid target warnings offer Proceed Anyway and open the native dialog", async () => {
	const f = fixture();
	await f.activation.start();
	f.targets.add(f.far);
	f.activation.targetChanged(f.far, true);
	assert.match(f.warnings[0], /outside range/);
	let opened = false;
	f.item.rollAttack = async () => { opened = true; return null; };
	await f.activation.attack();
	assert.equal(opened, true);
	assert.equal(f.confirmations[0].yes.label, "Proceed Anyway");
	assert.equal(f.consumed(), 0);
	assert.equal(f.messages.has("preview"), true);
	await f.activation.cancel();
});

test("Return to Targeting leaves preview and use untouched", async () => {
	const f = fixture({ confirm: false });
	await f.activation.start();
	f.item.rollAttack = () => assert.fail("Must not open attack dialog");
	await f.activation.attack();
	assert.equal(f.activation.busy, false);
	assert.equal(f.messages.has("preview"), true);
	assert.equal(f.item.system.uses.value, 2);
	await f.activation.cancel();
});

test("native dialog cancellation returns to the same targeting session without spending", async () => {
	const f = fixture();
	await f.activation.start();
	f.activation.targets = [f.target];
	f.item.rollAttack = async () => null;
	await f.activation.attack();
	assert.equal(f.consumed(), 0);
	assert.equal(f.item.system.uses.value, 2);
	assert.equal(f.activation.finished, false);
	await f.activation.cancel();
});

test("submission commits once even when the native submit callback runs twice", async () => {
	const f = fixture({ fastForward: true });
	await f.activation.start();
	f.activation.targets = [f.target];
	let rolls = 0;
	f.item.rollAttack = async options => {
		assert.equal(options.event.shiftKey, true);
		const app = { rollConfig: { options }, callbackFn: async () => { rolls++; return { total: 20 }; }, close: async () => {} };
		f.activation.bindAttackDialog(app);
		const results = await Promise.all([app.callbackFn(), app.callbackFn()]);
		return results[0];
	};
	await f.activation.attack();
	assert.equal(rolls, 1);
	assert.equal(f.consumed(), 1);
	assert.equal(f.item.system.uses.value, 1);
	assert.equal(f.activation.finished, true);
	assert.equal(f.messages.get("preview")[`flags.${MODULE_ID}.powerActivation.provisional`], false);
	assert.ok(f.hooks.some(([hook]) => hook === "dnd4e.usePower"));
});

test("battlefield changes during the native dialog return to selection before costs or rolls", async () => {
	const f = fixture();
	await f.activation.start();
	f.activation.targets = [f.target];
	f.item.rollAttack = async options => {
		const app = { rollConfig: { options }, callbackFn: () => assert.fail("Stale bonuses must not roll"), close: async () => {} };
		f.activation.bindAttackDialog(app);
		f.item.system.uses.value = 1;
		return app.callbackFn();
	};
	await f.activation.attack();
	assert.equal(f.consumed(), 0);
	assert.equal(f.activation.finished, false);
	assert.match(f.warnings[0], /battlefield changed/);
	await f.activation.cancel();
});


test("cover context exists only during selection and clears during handoff and cancellation", async () => {
	const f = fixture();
	f.activation.range.mode = "melee";
	await f.activation.start();
	const contexts = () => f.hooks.filter(([hook]) => hook === "coverContext");
	assert.equal(contexts().at(-1)[1].source, f.attacker);
	assert.equal(contexts().at(-1)[1].mode, "melee");
	f.activation.range.mode = "ranged";
	f.activation.refresh();
	assert.equal(contexts().at(-1)[1].mode, "ranged");
	f.item.rollAttack = async () => {
		assert.equal(contexts().at(-1)[1], null);
		return null;
	};
	await f.activation.attack();
	assert.ok(contexts().at(-1)[1]);
	await f.activation.cancel();
	assert.equal(contexts().at(-1)[1], null);
});
