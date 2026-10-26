import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin } from "../scripts/power-activation/area-geometry.js";
import { automationConfig, squareDistance, selectionProblems, supportsTargetAutomation, MODULE_ID, SETTING } from "../scripts/power-activation/rules.js";

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
		beginHole() { return this; }, endHole() { return this; },
		drawShape(shape) { shapes.push(shape); return this; },
		drawRect(...rectangle) { rectangles.push(rectangle); return this; }, endFill() { return this; },
	};
	class App {
		render() { return this; }
		async close() {}
	}
	const context = vm.createContext({
		console, AbortController, MODULE_ID, SETTING, automationConfig, selectionProblems, squareDistance,
		AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin,
		CoverPreview: { setContext: value => hooks.push(["coverContext", value]), register() {} },
		sharedAreaPreview: {
			show: value => hooks.push(["sharedArea", value.id]),
			clear: () => hooks.push(["sharedArea", null]), register() {},
		},
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
			interface: { addChild: () => graphics }, app: { view: { addEventListener() {} } },
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

test("melee, ranged and weapon activations retain existing targets inside their range", async () => {
	for (const rangeType of ["melee", "touch", "reach", "range", "weapon"]) {
		const f = fixture();
		f.item.system.rangeType = rangeType;
		f.context.api.setSession(null);
		f.targets.add(f.target);
		f.targets.add(f.far);
		await f.context.api.useAbility(f.item, f.attacker);
		assert.deepEqual([...f.targets], [f.target]);
		const context = f.hooks.find(([name]) => name === "coverContext")[1];
		assert.deepEqual(Array.from(context.targets), [f.target]);
	}
});

test("committed area uses place one Region with the preview bounds and close-burst hole", async () => {
	for (const shape of AREA_TYPES) {
		const f = fixture();
		const created = [];
		f.item.getFlag = () => ({ enabled: true, placeRegion: true });
		f.activation.range = { shape, area: 2, normal: 10, maximum: 10 };
		f.activation.origin = { x: 300, y: 400 };
		f.context.CONST = { REGION_VISIBILITY: { ALWAYS: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
		f.context.canvas.level = { id: "ground" };
		f.context.canvas.scene = {
			async createEmbeddedDocuments(type, data) { created.push({ type, data }); return data; },
		};
		await f.activation.finalizePowerUse();
		await f.activation.placeAreaRegion();
		assert.equal(created.length, 1);
		assert.equal(created[0].type, "Region");
		const region = created[0].data[0];
		const bounds = f.activation.areaBounds();
		assert.deepEqual(JSON.parse(JSON.stringify(region.shapes[0])), {
			type: "rectangle", x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, rotation: 0, hole: false,
		});
		assert.equal(region.shapes.length, shape === "closeBurst" ? 2 : 1);
		if (shape === "closeBurst") {
			assert.equal(region.shapes[1].hole, true);
			assert.equal(region.shapes[1].width, f.attacker.w);
		}
		assert.equal(region.levels[0], "ground");
		assert.equal(region.ownership.user, 3);
		assert.equal(f.item.system.uses.value, 1);
	}
});

test("Region placement is opt-in and area-only, and creation failure still commits the power", async () => {
	const f = fixture();
	let attempts = 0;
	f.context.canvas.scene = { async createEmbeddedDocuments() { attempts++; throw new Error("No Region permission"); } };
	f.context.CONST = { REGION_VISIBILITY: { ALWAYS: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
	f.activation.range = { shape: "closeBurst", area: 1 };
	await f.activation.placeAreaRegion();
	assert.equal(attempts, 0);
	f.item.getFlag = () => ({ placeRegion: true });
	f.activation.range = { normal: 1, maximum: 1 };
	await f.activation.placeAreaRegion();
	assert.equal(attempts, 0);
	f.activation.range = { shape: "closeBurst", area: 1 };
	await f.activation.finalizePowerUse();
	assert.equal(attempts, 1);
	assert.equal(f.item.system.uses.value, 1);
	assert.ok(f.warnings.some(message => message.includes("No Region permission")));
});

test("ranged activations preserve long-range targets and cancellation restores the original selection", async () => {
	const f = fixture();
	f.item.system.rangeType = "range";
	f.context.api.setSession(null);
	f.context.resolveRange = async () => ({ normal: 5, maximum: 10, mode: "ranged" });
	f.targets.add(f.far);
	await f.context.api.useAbility(f.item, f.attacker);
	assert.equal(f.targets.has(f.far), true);
	assert.equal(f.targets.size, 1);
	const activation = f.context.api;
	// Starting a replacement cancels the first session and restores its original targets.
	f.context.resolveRange = async () => ({ normal: 1, maximum: 1, mode: "ranged" });
	await activation.useAbility(f.item, f.attacker);
	assert.equal(f.targets.size, 0);
	assert.equal(f.consumed(), 0);
});

test("non-attack powers expose targeting and can start Use Ability for every supported range type", async () => {
	for (const rangeType of ["weapon", "melee", "touch", "reach", "range", ...AREA_TYPES]) {
		const f = fixture();
		f.item.hasAttack = false;
		f.item.system.rangeType = rangeType;
		assert.equal(supportsTargetAutomation(f.item), true);
		assert.equal(await f.context.api.useAbility(f.item, f.attacker), true);
		assert.equal(f.messages.size, 1);
		assert.equal(f.warnings.length, 0);
	}
});

test("Confirm commits non-attack use once and leaves targets selected without any attack roll", async () => {
	const f = fixture();
	f.item.hasAttack = false;
	f.item.rollAttack = () => assert.fail("utility powers must never roll an attack");
	await f.activation.start();
	f.activation.targets = [f.target];
	await Promise.all([f.activation.attack(), f.activation.attack()]);
	assert.equal(f.consumed(), 1);
	assert.equal(f.item.system.uses.value, 1);
	assert.equal(f.activation.finished, true);
	assert.equal(f.targets.has(f.target), true);
	assert.equal(f.messages.get("preview")[`flags.${MODULE_ID}.powerActivation.provisional`], false);
	assert.equal(f.hooks.filter(([hook]) => hook === "dnd4e.usePower").length, 1);
});

test("non-attack powers apply native self and all-target use effects to confirmed targets", async () => {
	const f = fixture();
	f.item.hasAttack = false;
	const applied = [];
	f.context.game.settings.get = (module, key) => key === "autoApplyEffects";
	f.context.loadSystem = async () => ({
		tokenForActor: () => f.attacker,
		applyEffectsToTokens: async (...args) => applied.push(args),
		applyAllXEffectsToTokens: async (...args) => applied.push(args),
	});
	await f.activation.start();
	f.activation.targets = [f.target];
	await f.activation.attack();
	assert.equal(applied.length, 2);
	assert.equal(applied[0][1][0], f.attacker);
	assert.equal(applied[0][2], "self");
	assert.deepEqual([...applied[1][2]], [f.target]);
});

test("declining utility warnings or resource consumption preserves the unspent targeting session", async () => {
	for (const declineResources of [false, true]) {
		const f = fixture({ confirm: false });
		f.item.hasAttack = false;
		await f.activation.start();
		if (declineResources) {
			f.activation.targets = [f.target];
			f.context.commitCardCosts = async () => false;
		}
		await f.activation.attack();
		assert.equal(f.consumed(), 0);
		assert.equal(f.item.system.uses.value, 2);
		assert.equal(f.activation.finished, false);
		assert.equal(Boolean(f.activation.commitStarted), false);
		await f.activation.cancel();
		assert.equal(f.messages.size, 0);
	}
});

test("utility effect failure after commitment retains the card and does not offer duplicate use", async () => {
	const f = fixture();
	f.item.hasAttack = false;
	f.context.commitPowerUse = async () => { throw new Error("effect failure"); };
	f.context.console = { ...console, error() {} };
	await f.activation.start();
	f.activation.targets = [f.target];
	await f.activation.attack();
	assert.equal(f.activation.finished, true);
	assert.equal(f.messages.size, 1);
	assert.equal(f.consumed(), 1);
	await f.activation.attack();
	assert.equal(f.consumed(), 1);
});

test("close burst starts with all intersecting targets, supports manual removal and cancels without costs", async () => {
	const f = fixture();
	f.activation.range = { shape: "closeBurst", area: 2, normal: 2, maximum: 2, mode: "area" };
	f.activation.placementLocked = true;
	f.activation.installPlacement = () => assert.fail("Close bursts do not need placement listeners");
	f.attacker.document.disposition = 1;
	f.target.document.disposition = -1;
	await f.activation.start();
	assert.deepEqual(f.activation.targets.map(token => token.id), [f.target.id]);
	assert.equal(f.activation.problems().length, 0);
	f.targets.clear();
	f.activation.targetChanged(f.target, false);
	assert.equal(f.activation.targets.length, 0);
	f.activation.refresh();
	assert.equal(f.activation.targets.length, 0);
	f.activation.selectAreaTargets();
	assert.equal(f.activation.targets.length, 1);
	await f.activation.cancel();
	assert.equal(f.messages.size, 0);
	assert.equal(f.consumed(), 0);
});

test("all-in-area close bursts update targets when creatures enter or leave the zone", async () => {
	const f = fixture();
	f.activation.range = { shape: "closeBurst", area: 2, normal: 2, maximum: 2, mode: "area" };
	await f.activation.start();
	f.far.x = 200;
	f.activation.refreshMovingToken(f.far);
	await new Promise(resolve => setTimeout(resolve, 150));
	assert.equal(f.targets.has(f.far), true);
	f.target.x = 500;
	f.activation.refreshMovingToken(f.target);
	await new Promise(resolve => setTimeout(resolve, 150));
	assert.equal(f.targets.has(f.target), false);
	assert.equal(f.targets.has(f.attacker), false);
	await f.activation.cancel();
});

test("area range checks the origin instead of affected creatures and respects exact-count opt-in", () => {
	const f = fixture();
	f.activation.range = { shape: "rangeBurst", area: 5, normal: 5, maximum: 5, mode: "area" };
	f.activation.origin = { x: 500, y: 0 };
	f.activation.placementLocked = true;
	f.activation.selectAreaTargets();
	assert.equal(f.activation.targets.includes(f.far), true);
	assert.equal(f.activation.problems().length, 0);
	f.item.getFlag = () => ({ enabled: true, targetCount: 1, targetMode: "exact" });
	assert.ok(f.activation.problems().some(problem => /exactly 1/.test(problem)));
	f.activation.origin = { x: 600, y: 0 };
	assert.ok(f.activation.problems().some(problem => /origin is outside range/.test(problem)));
});

test("unlocked placement cannot enter the attack dialog even with Proceed Anyway", async () => {
	const f = fixture();
	f.activation.range = { shape: "rangeBlast", area: 3, normal: 5, maximum: 5, mode: "area" };
	f.activation.placementLocked = false;
	f.item.rollAttack = () => assert.fail("unplaced area must not roll");
	await f.activation.attack();
	assert.equal(f.consumed(), 0);
	assert.match(f.warnings[0], /lock the area/);
});

test("moving the caster invalidates a previously adjacent close blast", () => {
	const f = fixture();
	f.activation.range = { shape: "closeBlast", area: 3, normal: 3, maximum: 3, mode: "area" };
	f.activation.origin = { x: 100, y: 0 };
	f.activation.placementLocked = true;
	f.activation.selectAreaTargets();
	assert.equal(f.activation.problems().length, 0);
	f.attacker.x = 1000;
	assert.ok(f.activation.problems().some(problem => /no longer adjacent/.test(problem)));
});

for (const shape of ["closeBlast", "rangeBurst", "rangeBlast"]) {
test(`${shape} placement uses the PIXI application view, locks and releases listeners on cancellation`, async () => {
	const f = fixture();
	const listeners = new Map();
	delete f.context.canvas.app.canvas;
	f.context.canvas.app.view = {
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
		addEventListener: (name, callback, options) => { listeners.set(name, { callback, signal: options.signal }); },
	};
	f.context.canvas.stage.toLocal = point => point;
	f.context.PIXI.Point = class { constructor(x, y) { Object.assign(this, { x, y }); } };
	f.context.canvas.dimensions = { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } };
	f.context.canvas.scene = { tokenVision: false };
	f.activation.range = { shape, area: 3, normal: 5, maximum: 5, mode: "area" };
	await f.activation.start();
	const event = { clientX: 120, clientY: 20, button: 0, preventDefault() {}, stopImmediatePropagation() {} };
	listeners.get("pointermove").callback(event);
	assert.equal(f.activation.origin.x, 100);
	assert.equal(f.activation.targets.includes(f.target), true);
	listeners.get("click").callback(event);
	assert.equal(f.activation.placementLocked, true);
	listeners.get("pointermove").callback({ ...event, clientX: 600 });
	assert.equal(f.activation.origin.x, 100);
	await f.activation.cancel();
	assert.ok([...listeners.values()].every(listener => listener.signal.aborted));
});
}

test("a missing canvas view reports an actionable error and cancels the provisional activation", async () => {
	const f = fixture();
	f.context.canvas.app = {};
	f.context.console = { ...console, error() {} };
	f.item.system.rangeType = "rangeBurst";
	f.context.resolveRange = async () => ({ shape: "rangeBurst", area: 1, normal: 10, maximum: 10, mode: "area" });
	await f.context.api.useAbility(f.item, f.attacker);
	assert.match(f.warnings[0], /canvas view is unavailable/);
	assert.equal(f.messages.size, 0);
	assert.equal(f.consumed(), 0);
});

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
	assert.equal(f.targets.has(f.target), true);
	f.targets.clear();
	f.activation.targetChanged(f.target, false);
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


test("shared AoE preview follows aiming, clears during handoff, resumes and clears on cancellation", async () => {
	const f = fixture();
	f.activation.range = { shape: "closeBurst", area: 2, normal: 2, maximum: 2, mode: "area" };
	f.context.resolveRange = async () => f.activation.range;
	f.activation.placementLocked = true;
	const previews = () => f.hooks.filter(([name]) => name === "sharedArea");
	await f.activation.start();
	assert.equal(previews().at(-1)[1], f.activation.id);
	f.item.rollAttack = async () => {
		assert.equal(previews().at(-1)[1], null);
		return null;
	};
	await f.activation.attack();
	assert.equal(previews().at(-1)[1], f.activation.id);
	await f.activation.cancel();
	assert.equal(previews().at(-1)[1], null);
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
