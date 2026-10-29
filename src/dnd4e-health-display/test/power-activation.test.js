import { attackVariants } from "../scripts/power-activation/attack-variants.js";
import { ActivationWorkflow } from "../scripts/power-activation/workflow.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { rollFromOrigin } from "../scripts/power-activation/system-adapter.js";
import { messageAttackResults, removeAttackTarget } from "../scripts/power-activation/attack-results.js";
import { AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin, hasLineOfEffect } from "../scripts/power-activation/area-geometry.js";
import { automationConfig, powerOriginRules, squareDistance, selectionProblems, targetCountProblems, supportsTargetAutomation, targetFilterProblems, MODULE_ID, SETTING } from "../scripts/power-activation/rules.js";

const source = readFileSync(new URL("../scripts/power-activation/power-activation.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const damageSource = readFileSync(new URL("../scripts/power-activation/damage-roll.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Reach review through the same legal transitions as a successful attack. */
function enterReview(activation) {
	activation.transition("attackDialog");
	activation.transition("preparingResults");
	activation.transition("reviewingResults");
}

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
		type: "power", id: "p", uuid: "Actor.a.Item.p", name: "Test attack", actor, isOwner: true, hasAttack: true,
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
		_configureRenderOptions() {}
		render() { return this; }
		async close() {}
	}
	const context = vm.createContext({
		publishDamageChat: async () => {}, requestDamageApplication: async activation => hooks.push(["damageApplication", activation.state]),
		summonGM: () => ({ id: "gm" }), requestSummon: async activation => activation.summonCreator?.(),
		ActivationWorkflow, console, AbortController, MODULE_ID, SETTING, automationConfig, powerOriginRules, selectionProblems, targetCountProblems, squareDistance, targetFilterProblems,
		AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin, hasLineOfEffect,
		CoverPreview: { setContext: value => hooks.push(["coverContext", value]), register() {} },
		attackVariants, rollFromOrigin, removeAttackTarget, syncAttackEffects: async () => {}, registerAttackEffects() {},
		attackResults: { register() {}, complete: id => hooks.push(["attackResultsComplete", id]) }, messageAttackResults,
		sharedAreaPreview: {
			show: value => hooks.push(["sharedArea", value.id]),
			clear: () => hooks.push(["sharedArea", null]), register() {},
		},
		foundry: {
			data: { PolygonTree },
			applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base, DialogV2: {
				confirm: async options => { confirmations.push(options); return confirm; },
				wait: async options => { confirmations.push(options); return confirm; },
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
		loadDamageDialogClass: async () => ({ asPromise() {} }),
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

test("Use Ability automatically targets the sole enemy in Melee 1 range without spending the power", async () => {
	const f = fixture();
	f.context.api.setSession(null);
	f.attacker.document.disposition = 1;
	f.target.document.disposition = -1;
	f.far.document.disposition = -1;
	f.item.getFlag = () => ({ enabled: true, targetCount: 1, targetDisposition: "enemies" });
	await f.context.api.useAbility(f.item, f.attacker);
	assert.deepEqual([...f.targets], [f.target]);
	assert.equal(f.consumed(), 0);
	assert.equal(f.item.system.uses.value, 2);
});

test("entering targeting selects both enemies when both fit a two-target power", async () => {
	const f = fixture();
	f.activation.count = 2;
	f.attacker.document.disposition = 1;
	f.target.document.disposition = -1;
	f.far.document.disposition = -1;
	f.far.x = 100;
	f.item.getFlag = () => ({ enabled: true, targetCount: 2, targetDisposition: "enemies" });
	await f.activation.start();
	assert.deepEqual([...f.targets], [f.target, f.far]);
});

test("direct targeting selects all eligible creatures only when they fit the target limit", async () => {
	for (const count of [1, 2]) {
		const f = fixture();
		f.activation.count = count;
		await f.activation.start();
		assert.deepEqual([...f.targets], [f.target]);
		f.target.setTarget(false);
		f.activation.targetChanged(f.target, false);
		f.activation.refresh();
		assert.equal(f.targets.size, 0, "manual removal must persist");
	}
	const f = fixture();
	f.far.x = 100;
	await f.activation.start();
	assert.equal(f.targets.size, 0, "excess candidates require a choice");
});

test("automatic direct selection respects disposition, conditions, visibility and elevation", async () => {
	for (const invalid of ["ally", "condition", "hidden", "elevation"]) {
		const f = fixture();
		f.attacker.document.disposition = 1;
		f.target.document.disposition = invalid === "ally" ? 1 : -1;
		f.item.getFlag = () => ({ enabled: true, targetCount: 1, targetDisposition: "enemies",
			targetCondition: invalid === "condition" ? "marked" : "" });
		f.target.visible = invalid !== "hidden";
		f.target.document.elevation = invalid === "elevation" ? 1 : 0;
		await f.activation.start();
		assert.equal(f.targets.size, 0, invalid);
	}
});

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
	assert.deepEqual([...f.targets], [f.target]);
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
		} else {
			f.activation.targets = [];
			f.activation.syncTargets();
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
	f.activation.transition("attackDialog");
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

test("targeting keeps full errors in the validation panel and short warnings on target rows", async () => {
	const f = fixture();
	f.activation.targets = [f.target, f.far];
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	const display = await panel._prepareContext();
	assert.equal(display.selectionLabel, "2 targets selected");
	assert.equal(display.ready, false);
	assert.ok(display.problems.some(problem => problem.includes("Selected 2")));
	assert.ok(display.problems.some(problem => problem.includes("far") && problem.includes("outside range")));
	assert.deepEqual(Array.from(display.targets.find(target => target.id === f.far.id).warnings), ["Out of Range"]);
	assert.equal(display.warningGroups.find(group => group.label === "Out of Range").text, "far");
	f.activation.range.maximum = 0;
	f.target.document.elevation = 1;
	f.far.document.elevation = 1;
	const grouped = await panel._prepareContext();
	assert.equal(grouped.warningGroups.filter(group => group.label === "Out of Range").length, 1);
	assert.equal(grouped.warningGroups.find(group => group.label === "Out of Range").text, "target, far");
	assert.equal(grouped.warningGroups.find(group => group.label === "Different Elevation").text, "target, far");
	assert.ok(grouped.warningGroups.some(group => !group.label && group.text.includes("Selected 2")));
	f.activation.range.maximum = 1;
	f.target.document.elevation = 0;
	f.activation.targets = [f.target];
	const ready = await panel._prepareContext();
	assert.equal(ready.selectionLabel, "1 target selected");
	assert.equal(ready.status, "Ready to Attack");
	assert.equal(ready.problems.length, 0);
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
	assert.equal(f.confirmations[0].buttons[0].label, "Proceed Anyway");
	assert.equal(f.consumed(), 0);
	assert.equal(f.messages.has("preview"), true);
	await f.activation.cancel();
});

test("closing the warning leaves preview and use untouched", async () => {
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
			sessionId: "session", pending: true, sceneId: "scene", targetIds: ["target"],
			itemUuid: f.item.uuid, casterId: f.attacker.id, effectsManaged: true,
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
	assert.equal(f.activation.view.screen, "results");
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

test("limited-target areas preserve manual selection when selecting or repositioning the area", () => {
	for (const shape of ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast", "wall"]) {
		const f = fixture();
		f.item.getFlag = () => ({ enabled: true, targetMode: "exact", targetCount: 1 });
		f.activation.range = { shape, area: 2, maximum: 10 };
		f.activation.origin = { x: 100, y: 0 };
		f.activation.wallCells = [{ x: 100, y: 0 }];
		f.activation.targets = [f.target];
		f.targets.add(f.target);
		f.far.x = 200;
		f.activation.selectAreaTargets();
		assert.deepEqual(Array.from(f.activation.targets), [f.target], shape);
		assert.deepEqual([...f.targets], [f.target], shape);
		f.activation.targets = [];
		f.targets.clear();
		f.activation.selectAreaTargets();
		assert.equal(f.targets.size, 0, shape + ": empty selection stays empty");
	}
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
	f.context.summonGM = () => permitted ? { id: "gm" } : null;
	f.context.fromUuid = async () => ({ documentName: "Actor", isOwner: true,
		getTokenDocument: async data => ({ toObject: () => ({ ...data, actorId: "summon", width: 2, height: 1 }) }) });
	f.context.canvas.scene = { async createEmbeddedDocuments(type, data) { creations++; received = data[0]; assert.equal(type, "Token"); return data; } };
	f.activation.summonCreator = () => f.context.canvas.scene.createEmbeddedDocuments("Token", [f.activation.summonData]);
	await f.activation.prepareSummon();
	assert.equal(creations, 0);
	await f.activation.placeSummon();
	await f.activation.placeSummon();
	assert.equal(creations, 1);
	assert.equal(received.x, 200);
	assert.equal(received.width, 2);
	permitted = false;
	await assert.rejects(f.activation.prepareSummon(), /GM must be logged in/);
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
	f.item.system.miss = { halfDamage: true };
	f.activation.targets = [f.target];
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	f.activation.panel = panel;
	panel.render = () => panel;
	let closed = 0;
	panel.close = async () => { closed++; };
	f.item.rollAttack = async () => {
		f.activation.captureAttackResults({ async update() {}, visible: true, isContentVisible: true,
			flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: [f.target.id] } } },
			rolls: [{ total: 12, options: { multirollData: { targetID: f.target.id, hitstate: "miss" } } }],
		});
		f.activation.attackRolled = true;
		await f.activation.finalizePowerUse();
	};
	await f.activation.attack();
	assert.equal(f.activation.view.screen, "results");
	assert.equal(f.activation.finished, false);
	assert.equal(closed, 0);
	panel.showDetails = true;
	f.target.document.texture = { src: "tokens/badger.webp" };
	const display = await panel._prepareContext();
	assert.equal(display.card, "card");
	assert.equal(display.showDetails, true);
	assert.equal(display.results[0].label, "MISS");
	assert.equal(display.results[0].img, "tokens/badger.webp");
	f.target.visible = false;
	const hiddenDisplay = await panel._prepareContext();
	assert.equal(hiddenDisplay.results[0].img, null);
	assert.equal(hiddenDisplay.results[0].name, "Unavailable target");
	f.target.visible = true;
	assert.equal(display.reviewing, true);
	assert.equal(display.needsDamage, false);
	await f.activation.rollDamage({});
	assert.equal(f.activation.state, "reviewingResults");
	assert.equal(f.activation.canComplete(), false);
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.confirmResults.call(panel);
	assert.equal((await panel._prepareContext()).needsDamage, true);
	assert.equal(display.resolutionRules, "resolution-rules");
	assert.equal(display.beforeAttackRules, "before-attack-rules");
	assert.equal(display.damageResults.length, 0);
	f.activation.targetChanged(f.far, true);
	assert.deepEqual(f.activation.targets, [f.target]);
	let release;
	let rolls = 0;
	f.item.damageRoll = { total: 18, async toMessage(data) { return { id: "damage", flags: data.flags, rolls: [this], async update() {} }; } };
	f.item.rollDamage = function() {
		rolls++;
		const roll = f.DamageRoll.createRoll([], [], this.getRollData(), { hitTypeDamage: true });
		void roll.toMessage();
		return new Promise(resolve => { release = resolve; });
	};
	const damage = f.activation.rollDamage({});
	await new Promise(resolve => setImmediate(resolve));
	await f.activation.rollDamage({});
	assert.equal(rolls, 1);
	release(f.item.damageRoll);
	await damage;
	assert.equal((await panel._prepareContext()).needsDamage, false);
	const rolledDisplay = await panel._prepareContext();
	assert.equal(rolledDisplay.resolutionRules, display.resolutionRules);
	assert.equal(rolledDisplay.damageResults[0].total, 18);
	await f.activation.confirmDamage();
	assert.equal(f.activation.finished, false);
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, true);
	assert.equal(closed, 1);
	assert.equal(f.item.system.uses.value, 1);
});

test("damage total and completion stay hidden until evaluation and Dice So Nice finish", async () => {
	const f = fixture();
	f.activation.targets = [f.target];
	enterReview(f.activation);
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
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
	await new Promise(resolve => setImmediate(resolve));
	assert.equal((await panel._prepareContext()).damageResults.length, 0);
	assert.equal(f.activation.canComplete(), false);
	roll.total = 23;
	publish({ id: "damage", flags: { [MODULE_ID]: { damageReview: { type: "normal" } } }, rolls: [{ total: 23 }], async update() {} });
	await animation;
	assert.equal((await panel._prepareContext()).reviewing, true, "keep the attack review visible during damage animation");
	assert.equal((await panel._prepareContext()).pendingDamage, false, "do not offer a retry before the first roll finishes");
	assert.equal((await panel._prepareContext()).damageResults.length, 0);
	assert.equal(f.activation.busy, true);
	finish();
	await pending;
	assert.equal((await panel._prepareContext()).damageResults[0].total, 23);
	assert.equal(f.activation.canComplete(), false);
	await f.activation.confirmDamage();
	assert.equal(f.activation.canComplete(), true);
});

test("cancelled damage keeps Roll Damage available; an attack without damage can complete", async () => {
	const f = fixture();
	f.activation.targets = [f.target];
	enterReview(f.activation);
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
	f.activation.committed = true;
	f.item.hasDamage = true;
	f.item.rollDamage = async () => null;
	await f.activation.rollDamage({});
	assert.notEqual(f.activation.state, "complete");
	assert.equal(f.activation.busy, false);
	assert.equal(f.activation.finished, false);
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, false);
	f.item.hasDamage = false;
	await f.activation.confirmDamage();
	assert.equal((await panel._prepareContext()).needsDamage, false);
	await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
	assert.equal(f.activation.finished, true);
});

test("all misses allow completing without damage while mixed and incomplete results do not", async () => {
	for (const outcomes of [["miss", "miss"], ["miss", "fumble"], ["miss", "hit"], ["miss", "critical"], ["miss"], []]) {
		const f = fixture();
		enterReview(f.activation);
		f.activation.transition("confirmingResults");
		f.activation.transition("readyForDamage");
		f.activation.committed = true;
		f.activation.targets = [f.target, f.far];
		f.item.hasDamage = true;
		f.activation.captureAttackResults({ async update() {}, visible: true, isContentVisible: true,
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
		assert.equal(display.canComplete, false);
		assert.equal(display.canConfirmDamage, true);
		f.activation.transition("rollingDamage");
		assert.equal(f.activation.canComplete(), false);
		f.activation.transition("readyForDamage");
		await f.activation.confirmDamage();
		await f.context.api.TargetingPanel.DEFAULT_OPTIONS.actions.complete.call(panel);
		assert.equal(f.activation.finished, true);
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
	f.activation.transition("attackDialog");
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
		assert.equal(f.activation.view.screen, "targeting");
		assert.equal(f.activation.busy, true);
		assert.equal(f.activation.state, "rollingAttack");
		assert.deepEqual(releases.map(entry => entry.id), ["attack-one", "attack-two"]);
		releases[0].resolve();
		await Promise.resolve();
		assert.equal(f.activation.view.screen, "targeting");
		if (disposed) {
			await f.activation.dispose(false);
		}
		releases[1].resolve();
		await attack;
		assert.equal(f.activation.view.screen, disposed ? "closed" : "results");
		assert.equal(f.activation.finished, disposed);
		assert.notEqual(f.activation.state, "rollingAttack");
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
	f.activation.transition("attackDialog");
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
	f.activation.transition("targeting");
	f.activation.applyDetectedCover(f.item, f.target, { bonuses: unrelated });
	assert.deepEqual(unrelated, bonuses());
});


test("confirmation updates existing chat messages before unlocking damage and can retry failures", async () => {
	const f = fixture();
	enterReview(f.activation);
	let fail = true;
	const updates = [];
	f.activation.attackMessages = [{ async update(change) {
		assert.notEqual(f.activation.state, "readyForDamage");
		if (fail) {
			throw new Error("Save failed");
		}
		updates.push(change);
	} }];
	await f.activation.confirmResults();
	assert.notEqual(f.activation.state, "readyForDamage");
	assert.equal(f.activation.busy, false);
	fail = false;
	await f.activation.confirmResults();
	assert.equal(f.activation.state, "readyForDamage");
	assert.equal(updates[0][`flags.${MODULE_ID}.attackResults.pending`], false);
});

test("critical-only attacks skip review while mixed and incomplete attacks retain normal review", async () => {
	for (const outcomes of [["critical", "fumble"], ["fumble", "fumble"], ["critical", "hit"], ["fumble", "miss"], ["critical"], []]) {
		const f = fixture();
		f.activation.targets = [f.target, f.far];
		f.item.hasDamage = true;
		const updates = [];
		f.item.rollAttack = async () => {
			f.activation.captureAttackResults({ visible: true, isContentVisible: true,
				async update(change) { updates.push(change); },
				flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: [f.target.id, f.far.id] } } },
				rolls: outcomes.map((outcome, index) => ({ total: 12, options: { multirollData: {
					targetID: f.activation.targets[index].id, hitstate: outcome, critstate: outcome,
				} } })),
			});
			f.activation.attackRolled = true;
			await f.activation.finalizePowerUse();
		};
		await f.activation.attack();
		const automatic = outcomes.length === 2 && outcomes.every(outcome => ["critical", "fumble"].includes(outcome));
		const harmless = automatic && outcomes.every(outcome => outcome === "fumble");
		assert.equal(f.activation.state === (harmless ? "complete" : "readyForDamage"), automatic, outcomes.join(","));
		assert.equal(updates.length, harmless ? 2 : automatic ? 1 : 0);
		if (automatic) {
			assert.equal(updates[0][`flags.${MODULE_ID}.attackResults.pending`], false);
		}
		const panel = Object.create(f.context.api.TargetingPanel.prototype);
		panel.session = f.activation;
		const display = await panel._prepareContext();
		assert.equal(display.reviewing, !automatic);
		assert.equal(display.needsDamage, automatic && !harmless);
		for (const [index, result] of display.results.entries()) {
			const fixed = ["critical", "fumble"].includes(outcomes[index]);
			assert.equal(result.fixedOutcome, fixed);
			assert.equal(result.canAdjust, !automatic && !fixed);
		}
	}
});

test("critical results reject modifier actions even during mixed-result review", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.attackMessages = [{ id: "critical", rolls: [{ options: { multirollData: { critstate: "critical" } } }] }];
	await f.activation.adjustResult({ dataset: { messageId: "critical", rollIndex: "0" },
		closest() { assert.fail("Critical results must not read modifier inputs"); } });
	assert.notEqual(f.activation.state, "readyForDamage");
	assert.equal(f.activation.busy, false);
});

test("review removal updates stored rolls and targets, reconciles effects, and skips review for remaining crits", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.targets = [f.target, f.far];
	f.item.hasDamage = true;
	const chat = { id: "attack", isOwner: true, visible: true, isContentVisible: true,
		flags: { [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: [f.target.id, f.far.id] } } },
		rolls: [f.target, f.far].map((token, index) => ({ total: 20, options: { multirollData: {
			targetID: token.id, hitstate: "hit", critstate: index ? "critical" : "normal",
		} } })),
		async update(change) {
			if (change.rolls) {
				this.rolls = change.rolls;
			}
			for (const property of ["targetIds", "pending"]) {
				const key = `flags.${MODULE_ID}.attackResults.${property}`;
				if (key in change) {
					this.flags[MODULE_ID].attackResults[property] = change[key];
				}
			}
		},
	};
	f.activation.attackMessages = [chat];
	let syncs = 0;
	f.context.syncAttackEffects = async activation => {
		assert.equal(chat.rolls.length, 1);
		assert.equal(chat.rolls[0].options.multirollData.targetID, f.far.id);
		assert.deepEqual(Array.from(activation.targets), [f.far]);
		syncs++;
	};
	await f.activation.removeReviewTarget(f.target.id);
	assert.ok(syncs >= 1);
	assert.deepEqual(chat.flags[MODULE_ID].attackResults.targetIds, [f.far.id]);
	assert.equal(chat.flags[MODULE_ID].attackResults.pending, false);
	assert.equal(f.activation.state, "readyForDamage");
	assert.equal(f.activation.canComplete(), false);
	assert.equal(f.item.system.uses.value, 2, "review does not consume another use");
});

test("removing the final target leaves an empty chat record, reconciles effects and permits completion without damage", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.targets = [f.target];
	f.item.hasDamage = true;
	const chat = { id: "attack", isOwner: true, flags: { [MODULE_ID]: { attackResults: { targetIds: [f.target.id] } } },
		rolls: [{ total: 20, options: { multirollData: { targetID: f.target.id } } }],
		async update(change) {
			if (change.rolls) {
				this.rolls = change.rolls;
				this.content = change.content;
				this.flags[MODULE_ID].attackResults.targetIds = change[`flags.${MODULE_ID}.attackResults.targetIds`];
			}
		},
	};
	f.activation.attackMessages = [chat];
	await f.activation.removeReviewTarget(f.target.id);
	assert.equal(chat.rolls.length, 0);
	assert.match(chat.content, /All targets removed/);
	assert.equal(f.activation.targets.length, 0);
	assert.equal(f.activation.state, "readyForDamage");
	await f.activation.confirmDamage();
	assert.equal(f.activation.canComplete(), true);
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	assert.equal((await panel._prepareContext()).needsDamage, false);
});

test("result adjustments reconcile effects after persisting the verdict, and failed reconciliation blocks confirmation", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.targets = [f.target];
	const chat = { id: "attack", rolls: [{ options: { multirollData: { hitstate: "miss" } } }], async update() {} };
	f.activation.attackMessages = [chat];
	f.context.adjustAttackMessage = async (message, index, modifier) => {
		assert.equal(index, 0);
		assert.equal(modifier, 3);
		message.rolls[0].options.multirollData.hitstate = "hit";
	};
	let syncs = 0;
	f.context.syncAttackEffects = async () => {
		assert.equal(chat.rolls[0].options.multirollData.hitstate, "hit");
		syncs++;
		throw new Error("Effect update failed");
	};
	await f.activation.adjustResult({ dataset: { messageId: "attack", rollIndex: "0" },
		closest: () => ({ querySelector: () => ({ value: "3" }) }) });
	assert.equal(syncs, 1);
	assert.equal(f.activation.busy, false);
	assert.notEqual(f.activation.state, "readyForDamage");
	await f.activation.confirmResults();
	assert.notEqual(f.activation.state, "readyForDamage");
	assert.ok(f.warnings.some(warning => warning.includes("Effect update failed")));
	f.context.syncAttackEffects = async () => {};
	await f.activation.confirmResults();
	assert.equal(f.activation.state, "readyForDamage");
});

test("workflow rejects out-of-order actions and keeps closed sessions terminal", () => {
	const activation = new ActivationWorkflow();
	assert.throws(() => activation.transition("rollingDamage"), /Invalid activation transition/);
	assert.equal(activation.state, "targeting");
	enterReview(activation);
	assert.throws(() => activation.transition("targeting"), /Invalid activation transition/);
	activation.transition("confirmingResults");
	activation.transition("closed");
	activation.transition("readyForDamage");
	assert.equal(activation.state, "closed");
	assert.equal(activation.busy, false);
});

test("confirmation finishing after disposal cannot reopen the results panel", async () => {
	const f = fixture();
	enterReview(f.activation);
	let release;
	f.context.syncAttackEffects = () => new Promise(resolve => { release = resolve; });
	const pending = f.activation.confirmResults();
	assert.equal(f.activation.state, "confirmingResults");
	await f.activation.dispose(false);
	release();
	await pending;
	assert.equal(f.activation.state, "closed");
	assert.equal(f.activation.canComplete(), false);
});


test("attack confirmation rolls each configured outcome once and skips damage confirmation for harmless misses", async () => {
	for (const [outcomes, miss, expected, missFormula] of [
		[["critical", "hit", "miss"], true, ["crit", "normal"]],
		[["critical", "miss"], false, ["crit"]],
		[["miss", "miss"], false, []],
		[["fumble"], false, []],
		[["miss"], true, ["normal"]],
		[["miss"], false, ["miss"], "2"],
		[["hit", "hit"], false, ["normal"]],
		[["hit", "miss"], false, ["miss", "normal"], "2"],
	]) {
		const f = fixture();
		enterReview(f.activation);
		f.item.hasDamage = true;
		f.item.system.miss = { halfDamage: miss, formula: missFormula };
		f.activation.targets = [f.target];
		f.activation.attackMessages = [{ visible: true, isContentVisible: true,
			flags: { [MODULE_ID]: { attackResults: { sessionId: "session", sceneId: "scene", targetIds: [f.target.id] } } },
			rolls: outcomes.map(outcome => ({ total: 12, options: { multirollData: { targetID: f.target.id, hitstate: outcome, critstate: outcome } } })),
			async update() {},
		}];
		const rolled = [];
		f.context.rollDamageAndWait = async (item, event, cls, review) => {
			rolled.push(review.type);
			return { message: { id: review.type, rolls: [{ total: 20 }], flags: { [MODULE_ID]: { damageReview: review } }, async update() {} } };
		};
		await f.activation.confirmResults();
		assert.deepEqual(rolled, expected);
		const damagePanel = Object.create(f.context.api.TargetingPanel.prototype);
		damagePanel.session = f.activation;
		const damageDisplay = await damagePanel._prepareContext();
		assert.equal(damageDisplay.needsDamage, false, "completed required rolls must hide the Damage button");
		assert.equal(damageDisplay.pendingDamage, false);
		assert.equal(damageDisplay.canConfirmDamage, expected.length > 0);
		if (miss && outcomes.includes("hit")) {
			const panel = Object.create(f.context.api.TargetingPanel.prototype);
			panel.session = f.activation;
			const hit = (await panel._prepareContext()).damageResults.find(result => result.label === "Hit");
			assert.equal(hit.sharedMiss, true);
			assert.equal(hit.missTotal, 10);
		}
		if (!expected.length) {
			assert.equal(f.activation.state, "complete");
			assert.equal(f.activation.view.status, "Damage confirmed");
		} else {
			assert.equal(f.activation.canComplete(), false);
		}
		await f.activation.confirmDamage();
		assert.equal(f.activation.state, "complete");
		assert.equal(f.activation.canComplete(), true);
	}
});

test("partial damage failures retain successful rolls and block confirmation until retry", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
	f.item.hasDamage = true;
	f.activation.targets = [f.target];
	f.activation.attackMessages = [{ async update() {}, visible: true, isContentVisible: true,
		flags: { [MODULE_ID]: { attackResults: { sessionId: "session", sceneId: "scene", targetIds: [f.target.id] } } },
		rolls: ["critical", "hit"].map(outcome => ({ total: 12, options: { multirollData: { targetID: f.target.id, critstate: outcome, hitstate: outcome } } })),
	}];
	const calls = [];
	let fail = true;
	f.context.rollDamageAndWait = async (item, event, cls, review) => {
		calls.push(review.type);
		if (review.type === "normal" && fail) {
			throw new Error("failed");
		}
		return { message: { id: review.type, rolls: [{ total: 20 }], flags: { [MODULE_ID]: { damageReview: review } }, async update() {} } };
	};
	await f.activation.rollDamage({}, true);
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "reviewingDamage");
	fail = false;
	await f.activation.rollDamage({}, true);
	assert.deepEqual(calls, ["crit", "normal", "normal"]);
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "complete");
});


test("dialog frame title follows targeting, attack, damage review and final confirmation", () => {
	const f = fixture();
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	const check = expected => {
		const options = { window: { resizable: true } };
		panel._configureRenderOptions(options);
		assert.equal(options.window.title, `Test attack · ${expected}`);
		assert.equal(options.window.resizable, true);
	};
	check("Select Targets");
	f.activation.transition("attackDialog");
	check("Attack dialog open");
	f.activation.transition("preparingResults");
	f.activation.transition("reviewingResults");
	check("Confirm attack");
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
	f.activation.transition("rollingDamage");
	check("Rolling damage…");
	f.activation.transition("reviewingDamage");
	check("Confirm damage");
	f.activation.transition("confirmingDamage");
	f.activation.transition("complete");
	check("Damage confirmed");
});


test("damage Apply retains the formula in its field through busy and completed renders", async () => {
	const f = fixture();
	enterReview(f.activation);
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
	f.activation.transition("rollingDamage");
	f.activation.transition("reviewingDamage");
	f.activation.damageMessages = [{ id: "damage", rolls: [{ total: 18 }], flags: { [MODULE_ID]: { damageReview: { type: "normal" } } } }];
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	const seen = [];
	f.activation.refresh = () => { seen.push(f.activation.state); };
	f.context.adjustDamageMessage = async (message, formula) => {
		assert.equal(formula, "-2");
		const context = await panel._prepareContext();
		assert.equal(context.reviewingDamage, true);
		assert.equal(context.damageResults[0].modifier, "-2");
	};
	await f.activation.adjustDamage({ dataset: { messageId: "damage" }, closest: () => ({ querySelector: () => ({ value: "-2" }) }) });
	assert.equal((await panel._prepareContext()).damageResults[0].modifier, "-2");
	assert.deepEqual(seen, ["updatingDamage", "reviewingDamage"]);
});

/** Give damage-review tests real message flags with an awaited update boundary. */
function damageReviewFixture(outcome = "hit") {
	const f = fixture();
	f.item.hasDamage = true;
	f.activation.targets = [f.target, f.far];
	enterReview(f.activation);
	f.activation.transition("confirmingResults");
	f.activation.transition("readyForDamage");
	f.activation.requiredDamageTypes = [];
	const attack = { id: "attack", visible: true, isContentVisible: true,
		flags: { [MODULE_ID]: { attackResults: { sessionId: "session", sceneId: "scene", targetIds: [f.target.id, f.far.id] } } },
		rolls: [f.target, f.far].map(token => ({ total: 20, options: { multirollData: { targetID: token.id, hitstate: outcome } } })),
		async update(change) {
			for (const [key, value] of Object.entries(change)) {
				this.flags[MODULE_ID][key.split(".").at(-1)] = value;
			}
		},
	};
	f.activation.attackMessages = [attack];
	const panel = Object.create(f.context.api.TargetingPanel.prototype);
	panel.session = f.activation;
	let evaluations = 0;
	f.context.Roll = class {
		constructor(formula) { this.formula = formula; }
		async evaluate() { evaluations++; this.total = this.formula === "2d6" ? 7 : Number(this.formula); return this; }
		toJSON() { return { formula: this.formula, total: this.total, evaluated: true }; }
	};
	const apply = formula => f.activation.adjustTargetDamage({ dataset: { tokenId: f.target.id },
		closest: () => ({ querySelector: () => ({ value: formula }) }) });
	return { ...f, panel, attack, apply, evaluations: () => evaluations };
}

test("a missed target accepts a bonus from zero without rolling shared damage; chat retains the receipt", async () => {
	const f = damageReviewFixture("miss");
	let display = await f.panel._prepareContext();
	assert.equal(display.results[0].damageTotal, 0);
	assert.equal(display.results[0].canAdjustDamage, true);
	await f.apply("2d6");
	display = await f.panel._prepareContext();
	assert.equal(display.results[0].damageTotal, 7);
	assert.equal(display.results[1].damageTotal, 0);
	assert.equal(display.results[0].damageModifier, "2d6");
	assert.equal(f.activation.damageMessages.length, 0);
	const review = f.attack.flags[MODULE_ID].targetDamageReview;
	assert.equal(review.pending, true);
	assert.equal(review.targets[0].modifierRoll.total, 7);
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "complete");
	assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.pending, false);
	assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.targets[0].total, 7);
});

test("target bonuses replace, clear and retain evaluated dice without changing shared rolls", async () => {
	const f = damageReviewFixture();
	f.activation.damageMessages = [{ id: "normal", rolls: [{ total: 8 }], flags: { [MODULE_ID]: { damageReview: { type: "normal" } } } }];
	for (const [formula, total] of [["2d6", 15], ["2d6", 15], ["-2", 6], ["", 8]]) {
		await f.apply(formula);
		const display = await f.panel._prepareContext();
		assert.equal(display.results[0].damageTotal, total);
		assert.equal(display.results[1].damageTotal, 8);
		assert.equal(f.activation.damageMessages[0].rolls[0].total, 8);
	}
	assert.equal(f.evaluations(), 3);
	assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.targets[0].modifierFormula, "");
});

test("target bonus failures and ownership changes retain the previous evaluated modifier", async () => {
	const f = damageReviewFixture("miss");
	await f.apply("2d6");
	f.attack.update = async () => { throw new Error("save failed"); };
	await f.apply("3");
	assert.equal(f.activation.state, "reviewingDamage");
	assert.equal((await f.panel._prepareContext()).results[0].damageTotal, 7);
	assert.match(f.warnings.at(-1), /save failed/);
	f.item.isOwner = false;
	await f.apply("9");
	assert.equal(f.evaluations(), 2, "ownership failure does not roll another bonus");
	assert.equal((await f.panel._prepareContext()).results[0].damageTotal, 7);
	assert.match(f.warnings.at(-1), /permission/);
});

test("missing required miss damage cannot be replaced by a target bonus", async () => {
	const f = damageReviewFixture("miss");
	f.activation.requiredDamageTypes = ["miss"];
	assert.equal((await f.panel._prepareContext()).results[0].canAdjustDamage, false);
	await f.apply("2d6");
	assert.equal(f.evaluations(), 0);
	assert.equal(f.activation.state, "readyForDamage");
});

test("damage confirmation retries failed target receipts and preserves final shared/individual totals", async () => {
	const f = damageReviewFixture("miss");
	await f.apply("2d6");
	const update = f.attack.update;
	f.attack.update = async () => { throw new Error("receipt failed"); };
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "reviewingDamage");
	assert.equal(f.activation.canComplete(), false);
	f.attack.update = update;
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "complete");
	assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.targets[0].total, 7);
});

test("results retain selected target order even when chat rolls arrive in reverse order", async () => {
	const f = damageReviewFixture("miss");
	f.attack.rolls.reverse();
	const display = await f.panel._prepareContext();
	assert.deepEqual(Array.from(display.results, result => result.tokenId), [f.target.id, f.far.id]);
	assert.equal(f.context.api.TargetingPanel.DEFAULT_OPTIONS.position.width, 408);
});

test("shared modifiers update every matching target while preserving original roll display and individual bonuses", async () => {
	const f = damageReviewFixture();
	const message = { id: "normal", rolls: [{ total: 8 }], flags: { [MODULE_ID]: { damageReview: { type: "normal", baseRolls: [{ total: 8 }] } } } };
	f.activation.damageMessages = [message];
	await f.apply("2d6");
	f.context.adjustDamageMessage = async (entry, formula) => {
		assert.equal(entry, message);
		assert.equal(formula, "+3");
		entry.rolls[0].total = 11;
	};
	await f.activation.adjustDamage({ dataset: { messageId: "normal" }, closest: () => ({ querySelector: () => ({ value: "+3" }) }) });
	const display = await f.panel._prepareContext();
	assert.equal(display.damageResults[0].rolled, 8);
	assert.equal(display.damageResults[0].total, 11);
	assert.equal(display.results[0].damageTotal, 18);
	assert.equal(display.results[1].damageTotal, 11);
	assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.targets[0].total, 18);
	assert.equal(f.evaluations(), 1, "changing the shared roll does not reroll the target's dice");
});

test("initial damage review waits for every outcome animation; retries keep the existing damage view", async () => {
	const f = damageReviewFixture();
	f.attack.rolls[0].options.multirollData.critstate = "critical";
	let release;
	const requests = [];
	f.context.rollDamageAndWait = async (item, event, cls, review) => {
		requests.push(review.type);
		return new Promise(resolve => { release = () => resolve({ message: {
			id: review.type, rolls: [{ total: 20 }], flags: { [MODULE_ID]: { damageReview: review } }, async update() {},
		} }); });
	};
	const rolling = f.activation.rollDamage({}, true);
	assert.equal(f.activation.state, "rollingDamage");
	assert.equal((await f.panel._prepareContext()).reviewing, true);
	assert.equal((await f.panel._prepareContext()).pendingDamage, false);
	release();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(requests, ["crit", "normal"]);
	assert.equal((await f.panel._prepareContext()).reviewing, true, "remain in attack review while the second animation runs");
	assert.equal((await f.panel._prepareContext()).canConfirmDamage, false);
	release();
	await rolling;
	assert.equal(f.activation.state, "reviewingDamage");
	assert.equal((await f.panel._prepareContext()).reviewing, false);
	assert.equal((await f.panel._prepareContext()).damageResults.length, 2);
	f.activation.damageMessages.pop();
	const retry = f.activation.rollDamage({}, true);
	assert.equal(f.activation.state, "retryingDamage");
	const retryDisplay = await f.panel._prepareContext();
	assert.equal(retryDisplay.reviewing, false, "retry keeps previously rolled damage visible");
	assert.equal(retryDisplay.reviewingDamage, true);
	assert.equal(retryDisplay.damageResults[0].total, 20);
	assert.equal(retryDisplay.busy, true);
	release();
	await retry;
	assert.equal(f.activation.state, "reviewingDamage");
	assert.equal((await f.panel._prepareContext()).damageResults.length, 2);
});

test("shared damage is presented Hit first, then Crit and Miss, without reordering recorded rolls", async () => {
	const f = damageReviewFixture();
	f.activation.damageMessages = ["crit", "miss", "normal"].map(type => ({
		id: type, rolls: [{ total: 10 }], flags: { [MODULE_ID]: { damageReview: { type } } },
	}));
	const display = await f.panel._prepareContext();
	assert.deepEqual(Array.from(display.damageResults, result => result.label), ["Hit", "Crit", "Miss"]);
	assert.deepEqual(Array.from(f.activation.damageMessages, message => message.id), ["crit", "miss", "normal"]);
});

test("half-on-miss uses one Hit roll even without Hit targets and produces a read-only derived card", async () => {
	for (const critical of [false, true]) {
		const f = damageReviewFixture("miss");
		f.item.system.miss = { halfDamage: true };
		if (critical) {
			f.attack.rolls[0].options.multirollData.critstate = "critical";
		}
		const calls = [];
		f.context.rollDamageAndWait = async (item, event, cls, review) => {
			calls.push(review.type);
			return { message: { id: review.type, rolls: [{ total: 11 }], flags: { [MODULE_ID]: { damageReview: review } }, async update() {} } };
		};
		await f.activation.rollDamage({}, true);
		assert.deepEqual(calls, critical ? ["crit", "normal"] : ["normal"]);
		assert.equal(calls.includes("miss"), false);
		let display = await f.panel._prepareContext();
		const miss = display.damageCards.find(card => card.type === "miss");
		assert.equal(miss.derived, true);
		assert.equal(miss.messageId, undefined);
		assert.equal(miss.total, 5);
		assert.equal(miss.sourceTotal, 11);
		assert.equal(display.damageCards[0].type, "normal");
		assert.equal(display.damageCards[0].count, 0);
		f.activation.damageMessages.find(message => message.id === "normal").rolls[0].total = 14;
		display = await f.panel._prepareContext();
		assert.equal(display.damageCards.find(card => card.derived).total, 7);
		assert.equal(display.results.at(-1).damageTotal, 7);
	}
});

test("separate Miss damage has its own editable message rather than a derived Hit total", async () => {
	const f = damageReviewFixture("miss");
	f.item.system.miss = { formula: "3", halfDamage: false };
	f.context.rollDamageAndWait = async (item, event, cls, review) => ({ message: {
		id: review.type, rolls: [{ total: 3 }], flags: { [MODULE_ID]: { damageReview: review } }, async update() {},
	} });
	await f.activation.rollDamage({}, true);
	const display = await f.panel._prepareContext();
	assert.equal(display.damageCards.length, 1);
	assert.equal(display.damageCards[0].messageId, "miss");
	assert.equal(display.damageCards[0].derived, undefined);
	assert.equal(display.reviewingDamage, true);
});

test("damage target disclosure starts collapsed and preserves user expansion through modifier updates", async () => {
	const f = damageReviewFixture("miss");
	assert.equal((await f.panel._prepareContext()).targetsExpanded, false);
	let toggle;
	const disclosure = { open: true, classList: { contains: () => false }, addEventListener(name, callback) {
		assert.equal(name, "toggle"); toggle = callback;
	} };
	f.panel.element = { querySelector: selector => selector === "[data-target-disclosure]" ? disclosure : null, querySelectorAll: () => [] };
	f.panel.setPosition = () => {};
	f.panel._onRender();
	toggle();
	await f.apply("2d6");
	assert.equal((await f.panel._prepareContext()).targetsExpanded, true);
	disclosure.open = false;
	toggle();
	assert.equal((await f.panel._prepareContext()).targetsExpanded, false);
	const attacking = fixture();
	enterReview(attacking.activation);
	const panel = Object.create(attacking.context.api.TargetingPanel.prototype);
	panel.session = attacking.activation;
	assert.equal((await panel._prepareContext()).targetsExpanded, true, "attack review remains expanded");
});

test("healing-only utility rolls once, reviews target surge totals, and confirms before completion", async () => {
	const f = fixture();
	f.item.hasAttack = false;
	f.item.hasDamage = false;
	f.item.hasHealing = true;
	f.item.system.hit = { healSurge: "surge" };
	f.target.actor.system = { details: { surgeValue: 9 } };
	f.activation.targets = [f.target];
	let rolls = 0;
	let confirmed = false;
	f.context.rollDamageAndWait = async (item, event, cls, review) => {
		rolls++;
		assert.equal(review.healing, true);
		return { message: { id: "heal", rolls: [{ total: 7 }], flags: { [MODULE_ID]: { damageReview: review } },
			async update(data) { confirmed = data[`flags.${MODULE_ID}.damageReview.pending`] === false; } } };
	};
	await f.activation.attack();
	assert.equal(f.activation.state, "reviewingHealing");
	assert.equal(f.activation.canComplete(), false);
	const panel = new f.context.api.TargetingPanel(f.activation);
	const view = await panel._prepareContext();
	assert.equal(view.results[0].surgeValue, 9);
	assert.equal(view.results[0].total, 16);
	await f.activation.rollHealing();
	assert.equal(rolls, 1);
	await f.activation.reviewHealing();
	assert.equal(confirmed, true);
	assert.equal(f.activation.canComplete(), true);
});


test("automation waits for player popups, rejects premature confirmation, and resumes on their message update", async () => {
	const f = fixture();
	const chat = { id: "defense", visible: true, isContentVisible: true, rolls: [], flags: {
		[MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: ["target"] } },
		playerDefense: { automationManaged: true, targets: [{ tokenId: "target", resolved: false }] },
	} };
	f.context.canvas.scene.id = "scene";
	f.activation.transition("attackDialog");
	f.activation.transition("preparingResults");
	f.activation.captureAttackResults(chat);
	assert.equal(f.activation.hasPendingDefenses(), true);
	f.activation.transition("awaitingDefenses");
	await f.activation.confirmResults();
	assert.equal(f.activation.state, "awaitingDefenses");
	Object.assign(chat.flags.playerDefense.targets[0], { resolved: true, total: 20, outcome: "miss" });
	f.activation.captureAttackResults(chat);
	assert.equal(f.activation.state, "reviewingResults");
	assert.equal(f.activation.hasPendingDefenses(), false);
	assert.equal(f.activation.attackMessages.length, 1);
	await f.activation.dispose(false);
	f.activation.captureAttackResults(chat);
	assert.equal(f.activation.state, "closed");
});


test("a pending defender can be removed without reviving it when a late response arrives", async t => {
	const f = fixture();
	f.context.canvas.scene.id = "scene";
	f.context.game.PlayerDefense = { renderManagedMessage: () => "remaining targets" };
	const previousGame = globalThis.game;
	globalThis.game = f.context.game;
	t.after(() => { globalThis.game = previousGame; });
	const chat = { id: "defense", visible: true, isContentVisible: true, isOwner: true, rolls: [], flags: {
		[MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: ["target", "far"] } },
		playerDefense: { automationManaged: true, targets: ["target", "far"].map(tokenId => ({ tokenId, resolved: false })) },
	}, async update(data) {
		this.flags[MODULE_ID].attackResults.targetIds = data[`flags.${MODULE_ID}.attackResults.targetIds`];
	} };
	f.activation.targets = [f.target, f.far];
	f.activation.transition("attackDialog");
	f.activation.transition("preparingResults");
	f.activation.captureAttackResults(chat);
	f.activation.transition("awaitingDefenses");
	await f.activation.removeReviewTarget("target");
	assert.equal(f.activation.state, "awaitingDefenses");
	assert.deepEqual([...chat.flags[MODULE_ID].attackResults.targetIds], ["far"]);
	Object.assign(chat.flags.playerDefense.targets[0], { resolved: true, outcome: "normal", total: 10 });
	f.activation.captureAttackResults(chat);
	assert.equal(f.activation.state, "awaitingDefenses");
	assert.deepEqual([...f.activation.targets].map(token => token.id), ["far"]);
});


test("a resolved player defense remains adjustable while another player is still defending", async () => {
  const f = fixture();
  f.context.game.user.isGM = true;
  f.context.canvas.scene.id = "scene";
  f.activation.targets = [f.target, f.far];
  f.activation.attackMessages = [{ id: "mixed", visible: true, isContentVisible: true, rolls: [], flags: {
    [MODULE_ID]: { attackResults: { sessionId: f.activation.id, sceneId: "scene", targetIds: ["target", "far"], pending: true } },
    playerDefense: { automationManaged: true, targets: [
      { tokenId: "target", natural: 15, resolved: true, total: 26, outcome: "miss" },
      { tokenId: "far", resolved: false },
    ] },
  } }];
  f.activation.transition("attackDialog");
  f.activation.transition("preparingResults");
  f.activation.transition("awaitingDefenses");
  const panel = Object.create(f.context.api.TargetingPanel.prototype);
  panel.session = f.activation;
  const view = await panel._prepareContext();
  assert.equal(view.results.find(result => result.tokenId === "target").canAdjust, true);
  assert.equal(view.results.find(result => result.tokenId === "far").canAdjust, false);
  const modifiers = [];
  f.context.game.PlayerDefense = { adjustDefenseTarget: async (message, tokenId, modifier) => modifiers.push([message.id, tokenId, modifier]) };
  await f.activation.adjustResult({ dataset: { messageId: "mixed", tokenId: "target", rollIndex: "-1" },
    closest: () => ({ querySelector: () => ({ value: "2" }) }) });
  assert.deepEqual(modifiers, [["mixed", "target", 2]]);
  assert.equal(f.activation.state, "awaitingDefenses");
});


test("GM damage review is requested only after every target receipt is confirmed", async () => {
	const f = damageReviewFixture("miss");
	let attempts = 0;
	f.context.requestDamageApplication = async activation => {
		attempts++;
		assert.equal(activation.state, "confirmingDamage");
		assert.equal(f.attack.flags[MODULE_ID].targetDamageReview.pending, false);
		if (attempts === 1) {
			throw new Error("request write failed");
		}
	};
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "reviewingDamage");
	await f.activation.confirmDamage();
	assert.equal(f.activation.state, "complete");
	assert.equal(attempts, 2);
});

test("spent automated powers cannot enter targeting or replace the current session", async () => {
	const f = fixture();
	f.item.system.uses.value = 0;
	assert.equal(await f.context.api.useAbility(f.item, f.attacker), true);
	assert.deepEqual(f.warnings, ["This power has no uses remaining."]);
	assert.equal(f.activation.state, "targeting");
	assert.equal(f.consumed(), 0);
	assert.equal(f.messages.size, 0);
	assert.equal(f.targets.size, 0);
});

for (const [variant, variance] of [["charge", { isCharge: true }], ["opportunity", { isOpp: true }], ["regular", {}]]) {
	test(`switching to ${variant} preserves targets and placement, updates the preview, and passes native variance`, async () => {
		const f = fixture();
		f.item.system.attack = { canCharge: true, canOpp: true };
		await f.activation.start();
		f.activation.targets = [f.target];
		f.activation.origin = { x: 100, y: 0 };
		f.activation.placementLocked = true;
		if (variant === "regular") {
			f.activation.variant = "charge";
		}
		const calls = [];
		f.context.resolveRange = async (_item, selected) => { calls.push(selected); return { normal: selected.isCharge ? 2 : 1, maximum: selected.isCharge ? 2 : 1 }; };
		f.context.renderPowerCard = async (_item, _utils, options) => { calls.push(options.variance); return "updated card"; };
		await f.activation.changeVariant(variant);
		assert.equal(f.activation.variant, variant);
		assert.deepEqual(JSON.parse(JSON.stringify(calls)), [variance, variance]);
		assert.deepEqual(f.activation.targets, [f.target]);
		assert.deepEqual(f.activation.origin, { x: 100, y: 0 });
		assert.equal(f.activation.placementLocked, true);
		assert.equal(f.activation.card, "updated card");
		assert.equal(f.consumed(), 0);
		assert.equal(f.item.system.uses.value, 2);
		let opened = false;
		f.item.rollAttack = async options => {
			opened = true;
			assert.deepEqual(JSON.parse(JSON.stringify(options.variance)), variance);
			return null;
		};
		await f.activation.attack();
		assert.equal(opened, true);
		assert.equal(f.activation.state, "targeting");
		assert.equal(f.activation.variant, variant);
		assert.equal(f.consumed(), 0);
	});
}

test("unsupported, busy, failed and late mode changes leave the session intact", async () => {
	const f = fixture();
	f.activation.refresh = () => {};
	await f.activation.changeVariant("charge");
	assert.equal(f.activation.variant, "regular");
	f.item.system.attack = { canCharge: true };
	f.activation.transition("attackDialog");
	await f.activation.changeVariant("charge");
	assert.equal(f.activation.variant, "regular");
	f.activation.transition("targeting");
	f.context.resolveRange = async () => { throw new Error("Invalid range"); };
	await f.activation.changeVariant("charge");
	assert.equal(f.activation.variant, "regular");
	assert.equal(f.activation.busy, false);
	assert.ok(f.warnings.includes("Invalid range"));
	let finish;
	f.context.resolveRange = () => new Promise(resolve => { finish = resolve; });
	const pending = f.activation.changeVariant("charge");
	await f.activation.attack();
	assert.equal(f.activation.state, "updatingVariant");
	await f.activation.dispose(false);
	finish({ normal: 2, maximum: 2 });
	await pending;
	assert.equal(f.activation.variant, "regular");
	assert.equal(f.activation.state, "closed");
});

test("target portraits pan and highlight without changing selection and ignore unavailable targets", async () => {
	const f = fixture();
	f.activation.targets = [f.target];
	const pans = [];
	const outlines = [];
	let destroyed = 0;
	f.context.canvas.animatePan = position => pans.push(position);
	f.context.canvas.interface.addChild = graphics => graphics;
	f.context.PIXI.Graphics = class {
		lineStyle() { return this; }
		drawRect(...bounds) { outlines.push(bounds); return this; }
		destroy() { destroyed++; }
	};
	await f.activation.focusTarget(f.target.id);
	assert.deepEqual(JSON.parse(JSON.stringify(pans)), [{ x: 150, y: 50 }]);
	f.activation.highlightTarget(f.target.id);
	assert.deepEqual(outlines, [[100, 0, 100, 100]]);
	f.activation.clearTargetHighlight();
	assert.equal(destroyed, 1);
	for (const unavailable of ["hidden", "deleted", "unselected", "canvas"]) {
		f.target.visible = unavailable !== "hidden";
		f.context.canvas.ready = unavailable !== "canvas";
		if (unavailable === "deleted") {
			f.tokenMap.delete(f.target.id);
		} else {
			f.tokenMap.set(f.target.id, f.target);
		}
		const id = unavailable === "unselected" ? f.far.id : f.target.id;
		await f.activation.focusTarget(id);
		f.activation.highlightTarget(id);
	}
	assert.equal(pans.length, 1);
	assert.equal(outlines.length, 1);
	assert.deepEqual(f.activation.targets, [f.target]);
	assert.equal(f.consumed(), 0);
	f.context.canvas.ready = true;
	f.activation.highlightTarget(f.target.id);
	await f.activation.dispose(false);
	assert.equal(destroyed, 2);
	await f.activation.focusTarget(f.target.id);
	assert.equal(pans.length, 1);
});

test("a range change retains the target but flags it as out of range, without spending", async () => {
	const f = fixture();
	f.item.system.attack = { canCharge: true };
	f.activation.targets = [f.far];
	f.activation.range = { normal: 10, maximum: 10 };
	f.context.resolveRange = async () => ({ normal: 1, maximum: 1 });
	await f.activation.changeVariant("charge");
	assert.deepEqual(f.activation.targets, [f.far]);
	assert.ok(f.activation.problems().some(problem => problem.includes("outside range")));
	assert.equal(f.consumed(), 0);
});
