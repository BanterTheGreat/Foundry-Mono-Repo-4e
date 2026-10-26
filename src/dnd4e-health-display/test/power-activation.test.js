import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { messageAttackResults } from "../scripts/power-activation/attack-results.js";
import { AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin, hasLineOfEffect } from "../scripts/power-activation/area-geometry.js";
import { automationConfig, powerOriginRules, squareDistance, selectionProblems, targetCountProblems, supportsTargetAutomation, targetFilterProblems, MODULE_ID, SETTING } from "../scripts/power-activation/rules.js";

const source = readFileSync(new URL("../scripts/power-activation/power-activation.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const damageSource = readFileSync(new URL("../scripts/power-activation/damage-roll.js", import.meta.url), "utf8")
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
	const actor = { id: "a", uuid: "Actor.a", isOwner: true, toObject: () => ({ id: "a" }) };
	const item = {
		id: "p", uuid: "Actor.a.Item.p", name: "Test attack", actor, isOwner: true, hasAttack: true,
		system: { uses: { per: "encounter", value: 2 }, rangeType: "melee", macros: [] },
		getFlag: () => ({ enabled: true, targetCount: 1 }),
		toObject: () => ({ uses: item.system.uses.value }),
		update: async data => { changes.push(data); item.system.uses.value = data["system.uses.value"]; },
	};
	class DamageRoll {
		static createRoll(parts, replacements, data) { return data.damageRoll; }
	}
	item.getRollData = () => ({ damageRoll: item.damageRoll });
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
		console, AbortController, MODULE_ID, SETTING, automationConfig, powerOriginRules, selectionProblems, targetCountProblems, squareDistance, targetFilterProblems,
		AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin, hasLineOfEffect,
		CoverPreview: { setContext: value => hooks.push(["coverContext", value]), register() {} },
		attackResults: { register() {}, complete: id => hooks.push(["attackResultsComplete", id]) }, messageAttackResults,
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
			scene: { id: "scene" },
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
		loadDamageRollClass: async () => DamageRoll,
		resolveRange: async () => ({ normal: 1, maximum: 1 }),
		registerAutomationTab: async () => {},
		renderPowerCard: async () => "power-card",
		postAttackRules: () => "resolution-rules",
		preAttackRules: () => "before-attack-rules",
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
	vm.runInContext(`${damageSource}\n${source}\nglobalThis.api = { ActivationSession, TargetingPanel, useAbility, showPowerInChat, setSession: value => { session = value; } };`, context);
	const activation = new context.api.ActivationSession(item, attacker, { normal: 1, maximum: 1 }, "card", 1);
	context.api.setSession(activation);
	return { context, activation, item, DamageRoll, target, far, attacker, targets, messages, warnings, confirmations, hooks, changes, rectangles, shapes, tokenMap, consumed: () => consumed };
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
	for (const shape of AREA_TYPES.filter(shape => shape !== "wall")) {
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
		assert.deepEqual(JSON.parse(JSON.stringify(options.flags[MODULE_ID].attackResults)), {
			sessionId: "session", sceneId: "scene", targetIds: ["target"],
		});
		const app = { rollConfig: { options }, callbackFn: async () => { rolls++; return { total: 20 }; }, close: async () => {} };
		f.activation.bindAttackDialog(app);
		const results = await Promise.all([app.callbackFn(), app.callbackFn()]);
		return results[0];
	};
	await f.activation.attack();
	assert.equal(rolls, 1);
	assert.equal(f.consumed(), 1);
	assert.equal(f.item.system.uses.value, 1);
	assert.equal(f.activation.finished, false);
	assert.equal(f.activation.phase, "results");
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


test("alternate origins require a whitelisted actor and reset placement; revocation invalidates the origin", () => {
	const f = fixture();
	f.target.document.actorId = "summon";
	f.far.document.actorId = "enemy";
	let allowed = ["Actor.summon"];
	f.item.getFlag = () => ({ enabled: true, originActors: allowed });
	assert.deepEqual(Array.from(f.activation.originChoices(), token => token.id), [f.attacker.id, f.target.id]);
	f.activation.range = { shape: "closeBurst", area: 1, maximum: 1 };
	f.activation.origin = { x: 100, y: 100 };
	f.activation.changeOrigin(f.target.id);
	assert.equal(f.activation.source, f.target);
	assert.equal(f.activation.caster, f.attacker);
	assert.equal(f.activation.origin, null);
	assert.equal(f.activation.originAllowed(), true);
	allowed = [];
	assert.equal(f.activation.originAllowed(), false);
});

test("close bursts include the caster and retain its Region space when toggled", async () => {
	const f = fixture();
	f.item.getFlag = () => ({ enabled: true, includeCaster: true, targetDisposition: "enemies", placeRegion: true });
	f.activation.range = { shape: "closeBurst", area: 1, maximum: 1 };
	f.activation.selectAreaTargets();
	assert.equal(f.activation.targets.includes(f.attacker), true);
	let shapes;
	f.context.CONST = { REGION_VISIBILITY: { ALWAYS: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
	f.context.canvas.scene = { async createEmbeddedDocuments(type, data) { shapes = data[0].shapes; return data; } };
	await f.activation.placeAreaRegion();
	assert.equal(shapes.length, 1);
	assert.equal(shapes[0].hole, false);
});

test("summon confirmation uses the actor prototype once and rejects permission or scene-bound failures before costs", async () => {
	const f = fixture();
	f.item.hasAttack = false;
	f.item.getFlag = () => ({ enabled: true, placementMode: "summon", summonActor: "Actor.summon" });
	f.activation.range = { shape: "summon", area: 1, maximum: 5 };
	f.activation.origin = { x: 200, y: 100 };
	f.activation.placementLocked = true;
	f.context.canvas.dimensions = { sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } };
	let permitted = true;
	let creations = 0;
	let received;
	f.context.TokenDocument = { canUserCreate: () => permitted };
	f.context.fromUuid = async () => ({ documentName: "Actor", isOwner: true,
		getTokenDocument: async data => ({ toObject: () => ({ ...data, actorId: "summon", width: 2, height: 1 }) }) });
	f.context.canvas.scene = { async createEmbeddedDocuments(type, data) { creations++; received = data[0]; assert.equal(type, "Token"); return data; } };
	await f.activation.prepareSummon();
	assert.equal(creations, 0);
	await f.activation.placeSummon();
	await f.activation.placeSummon();
	assert.equal(creations, 1);
	assert.equal(received.x, 200);
	assert.equal(received.width, 2);
	permitted = false;
	await assert.rejects(f.activation.prepareSummon(), /permission/);
	permitted = true;
	f.activation.origin.x = 900;
	await assert.rejects(f.activation.prepareSummon(), /footprint/);
});

test("player placement requires physical line of effect and cannot override it", async () => {
	const f = fixture();
	f.context.CONST = { WALL_MOVEMENT_TYPES: { NONE: 0 }, WALL_DOOR_STATES: { OPEN: 1 } };
	const wall = { c: [150, -1000, 150, 1000], move: 1, ds: 0 };
	f.context.canvas.walls = { placeables: [{ document: wall }] };
	for (const shape of ["rangeBurst", "rangeBlast", "summon", "closeBlast", "wall"]) {
		f.activation.range = { shape, area: 1, maximum: 10 };
		f.activation.origin = { x: 300, y: 0 };
		f.activation.wallCells = [{ x: 100, y: 0 }, { x: 300, y: 0 }];
		assert.equal(f.activation.lineOfEffectProblems().length, 1, shape);
		assert.equal(await f.activation.confirmProblems(), false, shape);
	}
	assert.equal(f.confirmations.length, 0, "no Proceed Anyway dialog for blocked placement");
	wall.ds = 1;
	assert.equal(f.activation.lineOfEffectProblems().length, 0, "open doors allow placement");
	wall.ds = 0;
	wall.move = 0;
	assert.equal(f.activation.lineOfEffectProblems().length, 0, "vision-only walls do not block effect");
	wall.move = 1;
	f.context.game.user.isGM = true;
	assert.equal(f.activation.lineOfEffectProblems().length, 0, "GM can adjudicate exceptions");
});

test("range preview uses the selected attack origin's active vision", () => {
	const f = fixture();
	f.context.canvas.dimensions = { sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } };
	f.context.canvas.scene = { tokenVision: true };
	const sight = { name: "alternate-origin-sight" };
	f.attacker.vision = { active: false };
	f.target.vision = { active: true, shape: { points: [0, 0, 100, 0, 0, 100], fragments: [sight] } };
	f.activation.source = f.target;
	f.activation.drawRange();
	assert.deepEqual(f.shapes, [sight]);
	f.shapes.length = 0;
	f.target.vision.active = false;
	f.attacker.vision = { active: true, shape: { points: [0, 0, 100, 0, 0, 100], fragments: [{ name: "caster-sight" }] } };
	f.activation.drawRange();
	assert.deepEqual(f.shapes, [{ name: "caster-sight" }], "original character selection still shows the preview");
	f.shapes.length = 0;
	f.attacker.vision.active = false;
	f.far.vision = { active: true, shape: f.target.vision.shape };
	f.activation.drawRange();
	assert.deepEqual(f.shapes, [], "unrelated controlled tokens do not grant preview vision");
});

test("automatic area refresh preserves manual exclusions until the area or excluded creature moves", async () => {
	for (const shape of ["closeBurst", "rangeBurst", "wall"]) {
		const f = fixture();
		f.activation.range = { shape, area: 2, maximum: 10 };
		f.activation.origin = { x: 100, y: 0 };
		f.activation.wallCells = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
		f.activation.selectAreaTargets();
		f.targets.delete(f.target);
		f.activation.targetChanged(f.target, false);
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), false, shape + ": refresh must preserve removal");
		f.far.x = 200;
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), false, shape + ": another token moving must preserve removal");
		assert.equal(f.targets.has(f.far), true, shape + ": new arrivals still auto-target");
		f.target.x = 110;
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), true, shape + ": moving excluded creature restores it");
		f.targets.delete(f.target);
		f.activation.targetChanged(f.target, false);
		if (shape === "closeBurst") { f.attacker.x += 10; }
		else if (shape === "wall") { f.activation.wallCells.push({ x: 300, y: 0 }); }
		else { f.activation.origin.x += 10; }
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), true, shape + ": area movement restores it");
		f.targets.delete(f.target);
		f.activation.targetChanged(f.target, false);
		f.target.x = 1500;
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), false);
		f.target.x = 110;
		f.activation.refreshAreaTargets();
		assert.equal(f.targets.has(f.target), true, shape + ": re-entry restores it");
		f.targets.delete(f.target);
		f.activation.targetChanged(f.target, false);
		f.activation.selectAreaTargets();
		assert.equal(f.targets.has(f.target), true, shape + ": explicit re-selection restores it");
	}
});

test("alternate area origins replace the caster for inclusion, preview holes and Regions", async () => {
	for (const includeCaster of [false, true]) {
		const f = fixture();
		f.item.getFlag = () => ({ enabled: true, includeCaster, placeRegion: true });
		f.activation.range = { shape: "closeBurst", area: 2, maximum: 2 };
		f.activation.source = f.target;
		f.activation.selectAreaTargets();
		assert.equal(f.activation.targets.includes(f.target), includeCaster);
		assert.equal(f.activation.targets.includes(f.attacker), true, "original caster follows the ordinary target filter");
		f.context.game.user.isGM = true;
		assert.equal(f.activation.areaProblems([f.target], false).some(problem => problem.includes("target filter")), !includeCaster);
		f.activation.drawRange();
		assert.equal(f.rectangles.some(rectangle => JSON.stringify(rectangle) === JSON.stringify([100, 0, 100, 100])), !includeCaster);
		let shapes;
		f.context.CONST = { REGION_VISIBILITY: { ALWAYS: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
		f.context.canvas.scene = { async createEmbeddedDocuments(type, data) { shapes = data[0].shapes; return data; } };
		await f.activation.placeAreaRegion();
		assert.equal(shapes.length, includeCaster ? 1 : 2);
		if (!includeCaster) {
			assert.equal(shapes[1].hole, true);
			assert.equal(shapes[1].x, f.target.x);
		}
	}
});


test("counted creature targeting distinguishes exact and up-to counts", () => {
	for (const required of [2, 3]) {
		for (let selected = 0; selected <= required + 1; selected++) {
			assert.equal(targetCountProblems(selected, required).length === 0, selected === required);
			assert.equal(targetCountProblems(selected, required, "upTo").length === 0, selected >= 1 && selected <= required);
		}
	}
	assert.equal(automationConfig({ getFlag: () => ({}) }).targetCountMode, "exact");
	assert.equal(automationConfig({ getFlag: () => ({ targetCountMode: "upTo" }) }).targetCountMode, "upTo");
});


test("exact and up-to settings reach individual and counted-area validation", () => {
	for (const area of [false, true]) {
		const f = fixture();
		const config = { enabled: true, targetCount: 2, targetMode: "exact", targetCountMode: "upTo" };
		f.item.getFlag = () => config;
		f.activation.count = 2;
		f.activation.targets = [f.target];
		if (area) {
			f.activation.range = { shape: "closeBurst", area: 2, normal: 2, maximum: 2 };
			f.activation.placementLocked = true;
		}
		assert.equal(f.activation.problems().length, 0);
		config.targetCountMode = "exact";
		assert.match(f.activation.problems().join(" "), /expects exactly 2/);
		config.targetCountMode = "upTo";
		f.activation.targets = [];
		assert.match(f.activation.problems().join(" "), /expects 1 to 2/);
		f.activation.targets = [f.target, f.far, f.attacker];
		assert.match(f.activation.problems().join(" "), /expects 1 to 2/);
	}
});

test("committed attack stays open with its results and full power until damage and Complete", async () => {
	const f = fixture();
	f.item.hasDamage = true;
	f.activation.targets = [f.target];
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	f.activation.panel = panel;
	panel.render = () => panel;
	let closed = 0;
	panel.close = async () => { closed++; };
	f.item.rollAttack = async () => {
		f.activation.captureAttackResults({ visible: true, isContentVisible: true,
			flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: [f.target.id] } } },
			rolls: [{ total: 12, options: { multirollData: { targetID: f.target.id, hitstate: "miss" } } }],
		});
		f.activation.attackRolled = true;
		await f.activation.finalizePowerUse();
	};
	await f.activation.attack();
	assert.equal(f.activation.phase, "results");
	assert.equal(f.activation.finished, false);
	assert.equal(closed, 0);
	panel.showDetails = true;
	const display = await panel._prepareContext();
	assert.equal(display.card, "card");
	assert.equal(display.showDetails, true);
	assert.equal(display.results[0].label, "MISS");
	assert.equal(display.needsDamage, true);
	assert.equal(display.resolutionRules, "resolution-rules");
	assert.equal(display.beforeAttackRules, "before-attack-rules");
	assert.equal(display.hasDamageTotal, false);
	f.activation.targetChanged(f.far, true);
	assert.deepEqual(f.activation.targets, [f.target]);
	let release;
	let rolls = 0;
	f.item.damageRoll = { total: 18, async toMessage() { return { id: "damage", rolls: [this] }; } };
	f.item.rollDamage = function() {
		rolls++;
		const roll = f.DamageRoll.createRoll([], [], this.getRollData(), { hitTypeDamage: true });
		void roll.toMessage();
		return new Promise(resolve => { release = resolve; });
	};
	const damage = f.activation.rollDamage({});
	await f.activation.rollDamage({});
	assert.equal(rolls, 1);
	release(f.item.damageRoll);
	await damage;
	assert.equal((await panel._prepareContext()).needsDamage, false);
	const rolledDisplay = await panel._prepareContext();
	assert.equal(rolledDisplay.resolutionRules, display.resolutionRules);
	assert.equal(rolledDisplay.hasDamageTotal, true);
	assert.equal(rolledDisplay.damageTotal, 18);
	assert.equal(f.activation.finished, false);
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, true);
	assert.equal(closed, 1);
	assert.equal(f.item.system.uses.value, 1);
});

test("damage total and completion stay hidden until evaluation and Dice So Nice finish", async () => {
	const f = fixture();
	f.activation.phase = "results";
	f.item.hasDamage = true;
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	let publish;
	const roll = { total: 0, toMessage: () => new Promise(resolve => { publish = resolve; }) };
	f.item.damageRoll = roll;
	f.item.rollDamage = async function() {
		const result = f.DamageRoll.createRoll([], [], this.getRollData(), { hitTypeDamage: true });
		void result.toMessage();
		return result;
	};
	let finish;
	let started;
	const animation = new Promise(resolve => { started = resolve; });
	f.context.game.dice3d = { waitFor3DAnimationByMessageID(id) {
		assert.equal(id, "damage");
		started();
		return new Promise(resolve => { finish = resolve; });
	} };
	const pending = f.activation.rollDamage({});
	await Promise.resolve();
	await Promise.resolve();
	assert.equal((await panel._prepareContext()).hasDamageTotal, false);
	assert.equal(f.activation.canComplete(), false);
	roll.total = 23;
	publish({ id: "damage", rolls: [{ total: 23 }] });
	await animation;
	assert.equal((await panel._prepareContext()).hasDamageTotal, false);
	assert.equal(f.activation.busy, true);
	finish();
	await pending;
	assert.equal((await panel._prepareContext()).damageTotal, 23);
	assert.equal(f.activation.canComplete(), true);
});

test("cancelled damage keeps Roll Damage available; an attack without damage can complete", async () => {
	const f = fixture();
	f.activation.phase = "results";
	f.activation.committed = true;
	f.item.hasDamage = true;
	f.item.rollDamage = async () => null;
	await f.activation.rollDamage({});
	assert.equal(Boolean(f.activation.damageRolled), false);
	assert.equal(f.activation.busy, false);
	assert.equal(f.activation.finished, false);
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, false);
	f.item.hasDamage = false;
	assert.equal((await panel._prepareContext()).needsDamage, false);
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, true);
});

test("all misses allow completing without damage while mixed and incomplete results do not", async () => {
	for (const outcomes of [["miss", "miss"], ["miss", "fumble"], ["miss", "hit"], ["miss", "critical"], ["miss"], []]) {
		const f = fixture();
		f.activation.phase = "results";
		f.activation.committed = true;
		f.activation.targets = [f.target, f.far];
		f.item.hasDamage = true;
		f.activation.captureAttackResults({ visible: true, isContentVisible: true,
			flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: [f.target.id, f.far.id] } } },
			rolls: outcomes.map((outcome, index) => ({ total: 12, options: { multirollData: {
				targetID: f.activation.targets[index].id, hitstate: outcome, critstate: outcome,
			} } })),
		});
		const panel = Object.create(f.context.api.TargetingPanel.prototype);
		panel.session = f.activation;
		const expected = outcomes.length === 2 && outcomes.every(outcome => ["miss", "fumble"].includes(outcome));
		const display = await panel._prepareContext();
		assert.equal(display.needsDamage, true);
		assert.equal(display.canComplete, expected);
		f.activation.busy = true;
		assert.equal(f.activation.canComplete(), false);
		f.activation.busy = false;
		await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
		assert.equal(f.activation.finished, expected);
		assert.equal(Boolean(f.activation.damageRolled), false);
	}
});

test("condition and adjacency filters combine and reject hidden, overlapping, neutral and elevated neighbors", () => {
	const token = (id, x, y = 0) => ({ id, name: id, visible: true, x, y, w: 100, h: 100,
		actor: { statuses: new Set(["prone"]) }, document: { disposition: 1, elevation: 0 } });
	const target = token("target", 0);
	const neighbor = token("neighbor", 100, 100);
	const config = { targetCondition: "prone", targetAdjacent: "allies" };
	const check = () => targetFilterProblems(target, config, [target, neighbor], 100);
	assert.deepEqual(check(), []);
	target.actor.statuses.clear();
	assert.match(check()[0], /condition/);
	target.actor.statuses.add("prone");
	for (const change of [{ visible: false }, { x: 0, y: 0 }, { document: { disposition: 0, elevation: 0 } },
		{ document: { disposition: 1, elevation: 1 } }]) {
		const saved = { ...neighbor };
		Object.assign(neighbor, change);
		assert.equal(check().length, 1);
		Object.assign(neighbor, saved);
	}
	config.targetAdjacent = "enemies";
	assert.equal(check().length, 1);
	neighbor.document.disposition = -1;
	assert.deepEqual(check(), []);
	target.w = 200;
	neighbor.x = 200;
	neighbor.y = 0;
	assert.deepEqual(check(), []);
	target.document.disposition = 0;
	assert.equal(check().length, 1);
});

test("mandatory filters block manual selection overrides and automatically update area targets", async () => {
	const f = fixture({ confirm: true });
	f.item.getFlag = () => ({ enabled: true, targetCount: 1, targetCondition: "prone" });
	f.target.actor.statuses = new Set();
	f.activation.targets = [f.target];
	assert.equal(await f.activation.confirmProblems(), false);
	assert.equal(f.confirmations.length, 0);
	assert.equal(f.consumed(), 0);
	f.target.actor.statuses.add("prone");
	assert.equal(await f.activation.confirmProblems(), true);
	f.activation.range = { shape: "closeBurst", area: 1, maximum: 1 };
	f.activation.placementLocked = true;
	f.activation.selectAreaTargets();
	assert.ok(f.activation.targets.includes(f.target));
	f.target.actor.statuses.clear();
	f.activation.refreshAreaTargets();
	assert.equal(f.activation.targets.length, 0);
});

test("adjacency changes while the native dialog is open invalidate confirmation", () => {
	const f = fixture();
	f.item.getFlag = () => ({ enabled: true, targetCount: 1, targetAdjacent: "enemies" });
	f.target.document.disposition = 1;
	f.attacker.document.disposition = -1;
	f.activation.targets = [f.target];
	const key = f.activation.contextKey();
	assert.equal(f.activation.filterProblems().length, 0);
	f.attacker.document.disposition = 0;
	assert.notEqual(f.activation.contextKey(), key);
	assert.equal(f.activation.filterProblems().length, 1);
});

test("attack results detach the range mask before destroying its graphics geometry", async () => {
	const f = fixture();
	const mask = { geometry: { graphicsData: [] }, destroy() { this.geometry = null; } };
	const overlay = { mask, clear() {}, destroy() {} };
	f.activation.graphics = overlay;
	f.activation.rangeMask = mask;
	await f.activation.complete({ keepOpen: true });
	// PIXI's next mask pass reads geometry.graphicsData, even on an empty overlay.
	assert.doesNotThrow(() => overlay.mask?.geometry.graphicsData);
	assert.equal(overlay.mask, null);
	assert.equal(mask.geometry, null);
	await f.activation.dispose(false);
});

test("target dialog waits for every attack animation before transforming, without reopening after disposal", async () => {
	for (const disposed of [false, true]) {
		const f = fixture();
		f.activation.targets = [f.target];
		const releases = [];
		let waiting;
		const started = new Promise(resolve => { waiting = resolve; });
		f.context.game.dice3d = { waitFor3DAnimationByMessageID(id) {
			return new Promise(resolve => { releases.push({ id, resolve }); if (releases.length === 2) waiting(); });
		} };
		f.item.rollAttack = async () => {
			f.activation.attackRolled = true;
			f.activation.committed = true;
			f.activation.commitStarted = true;
			for (const id of ["attack-one", "attack-two"]) {
				f.activation.captureAttackResults({ id, flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id } } } });
			}
		};
		const attack = f.activation.attack();
		await started;
		assert.equal(f.activation.phase, "targeting");
		assert.equal(f.activation.busy, true);
		assert.equal(f.activation.waitingForDice, true);
		assert.deepEqual(releases.map(entry => entry.id), ["attack-one", "attack-two"]);
		releases[0].resolve();
		await Promise.resolve();
		assert.equal(f.activation.phase, "targeting");
		if (disposed) {
			await f.activation.dispose(false);
		}
		releases[1].resolve();
		await attack;
		assert.equal(f.activation.phase, disposed ? "targeting" : "results");
		assert.equal(f.activation.finished, disposed);
		assert.equal(f.activation.waitingForDice, false);
	}
});

test("character origins are inherited, while custom origins replace them and can exclude the caster", async () => {
	const f = fixture();
	f.target.document.actorId = "general";
	f.far.document.actorId = "spirit";
	f.item.actor.getFlag = () => ({ originActors: ["Actor.general"] });
	assert.deepEqual(Array.from(f.activation.originChoices(), token => token.id), [f.attacker.id, f.target.id]);
	f.item.getFlag = () => ({ enabled: true, originMode: "custom", allowCaster: false, originActors: ["Actor.spirit"] });
	assert.deepEqual(Array.from(f.activation.originChoices(), token => token.id), [f.far.id]);
	await f.activation.start();
	assert.equal(f.activation.source, f.far);
	assert.equal(f.activation.caster, f.attacker);
	assert.equal(f.activation.originAllowed(), true);
	f.far.visible = false;
	assert.equal(f.activation.originAllowed(), false);
});

test("required companion absence blocks activation before creating a card or paying costs", async () => {
	for (const originActors of [[], ["Actor.missing"]]) {
		const f = fixture();
		f.item.actor.getFlag = () => ({ originActors: ["Actor.a"] });
		f.item.getFlag = () => ({ enabled: true, originMode: "custom", allowCaster: false, originActors });
		await assert.rejects(f.activation.start(), /No eligible origin/);
		assert.equal(f.messages.size, 0);
		assert.equal(f.consumed(), 0);
	}
});

test("legacy origins stay custom while explicitly inherited powers ignore saved custom actors", () => {
	const actor = { getFlag: () => ({ originActors: ["Actor.general"] }) };
	const item = { actor, getFlag: () => ({ originActors: ["Actor.legacy"] }) };
	assert.deepEqual(powerOriginRules(item), { originActors: ["Actor.legacy"], allowCaster: true });
	item.getFlag = () => ({ originMode: "character", originActors: ["Actor.legacy"], allowCaster: false });
	assert.deepEqual(powerOriginRules(item), { originActors: ["Actor.general"], allowCaster: true });
});


test("detected cover seeds each native target independently and preserves stronger cover", () => {
	const f = fixture();
	f.activation.busy = true;
	f.activation.targets = [f.target, f.far];
	let kind = "cover";
	f.context.CoverPreview.evaluate = (source, target, mode) => {
		assert.equal(source, f.activation.source);
		return { kind: target === f.target ? kind : "clear" };
	};
	const bonuses = () => ({ cover: { shouldApply: false }, coverSup: { shouldApply: false } });
	const first = bonuses();
	f.activation.applyDetectedCover(f.item, f.target, { bonuses: first });
	assert.equal(first.cover.shouldApply, true);
	const other = bonuses();
	f.activation.applyDetectedCover(f.item, f.far, { bonuses: other });
	assert.equal(other.cover.shouldApply, false);
	kind = "superior";
	f.activation.applyDetectedCover(f.item, f.target, { bonuses: first });
	assert.equal(first.cover.shouldApply, false);
	assert.equal(first.coverSup.shouldApply, true);
	kind = "cover";
	f.activation.applyDetectedCover(f.item, f.target, { bonuses: first });
	assert.equal(first.cover.shouldApply, false);
	assert.equal(first.coverSup.shouldApply, true);
	for (const ignored of ["clear", "blocked", undefined]) {
		kind = ignored;
		const unchanged = bonuses();
		f.activation.applyDetectedCover(f.item, f.target, { bonuses: unchanged });
		assert.deepEqual(unchanged, bonuses());
	}
	kind = "cover";
	const unrelated = bonuses();
	f.activation.applyDetectedCover({ uuid: "other" }, f.target, { bonuses: unrelated });
	f.activation.busy = false;
	f.activation.applyDetectedCover(f.item, f.target, { bonuses: unrelated });
	assert.deepEqual(unrelated, bonuses());
});
