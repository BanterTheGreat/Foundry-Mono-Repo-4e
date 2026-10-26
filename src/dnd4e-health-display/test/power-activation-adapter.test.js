import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { automationConfig, MODULE_ID, FLAG } from "../scripts/power-activation/rules.js";
import { AREA_TYPES } from "../scripts/power-activation/area-geometry.js";

test("alternate-origin rolls retain caster data and bind document methods without mutating it", async () => {
	const adapter = loadAdapter();
	class Caster {
		#name = "caster";
		getName() { return this.#name; }
	}
	const actor = new Caster();
	actor.token = { object: { id: "caster" } };
	actor.system = { attack: 12 };
	const source = { id: "summon", document: {} };
	source.document.object = source;
	const item = {
		actor,
		async rollAttack(options) {
			assert.equal(this.actor instanceof Caster, true);
			assert.equal(this.actor.token.object, source);
			assert.equal(this.actor.system.attack, 12);
			assert.equal(this.actor.getName(), "caster");
			assert.equal(options.powerActivationSession, "session");
			assert.equal(actor.token.object.id, "caster");
			return "roll";
		},
	};
	assert.equal(await adapter.rollFromOrigin(item, source, { powerActivationSession: "session" }), "roll");
	assert.equal(item.actor, actor);
	assert.equal(actor.token.object.id, "caster");
});

test("summon mode resolves Range without requiring an area or a weapon", async () => {
	const adapter = loadAdapter();
	const item = { actor: {}, getFlag: () => ({ placementMode: "summon" }), system: { rangeType: "personal", rangePower: "0" } };
	assert.equal((await adapter.resolveRange(item)).shape, "summon");
	assert.equal((await adapter.resolveRange(item)).maximum, 0);
	item.system.rangePower = "invalid";
	await assert.rejects(adapter.resolveRange(item), /whole-square Range/);
});

/** Exercise the real version adapter against controlled system resolver/formula boundaries. */
function loadAdapter(weapon = null, combat = null) {
	const source = readFileSync(new URL("../scripts/power-activation/system-adapter.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
	const context = vm.createContext({
		MODULE_ID, FLAG, AREA_TYPES, automationConfig: item => automationConfig({ getFlag: () => ({}), ...item }),
		utils: {
			getWeaponUse: () => weapon,
			evaluateFormula: formula => formula === "@reach" ? 3 : Number(formula),
		},
		game: { combat },
	});
	vm.runInContext(`${source}\nsystemPromise = Promise.resolve(utils); globalThis.api = {resolveRange, commitCardCosts, commitPowerUse, rollFromOrigin, automationSheetState};`, context);
	return context.api;
}

test("Automation settings follow the range and workflow without clearing hidden values", () => {
	const adapter = loadAdapter();
	const config = { enabled: true, targetMode: "area", targetCount: 3, wallHeight: 4, placeRegion: true, includeCaster: true };
	const item = { hasAttack: true, system: { rangeType: "wall" }, getFlag: () => config };
	let view = adapter.automationSheetState(item);
	assert.equal(view.area, true);
	assert.equal(view.wall, true);
	assert.equal(view.showTargetCount, false);
	config.targetMode = "exact";
	assert.equal(adapter.automationSheetState(item).showTargetCount, true);
	for (const rangeType of ["weapon", "melee", "touch", "reach", "range"]) {
		item.system.rangeType = rangeType;
		view = adapter.automationSheetState(item);
		assert.equal(view.area, false);
		assert.equal(view.wall, false);
		assert.equal(view.showTargetCount, true);
	}
	for (const rangeType of ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast"]) {
		item.system.rangeType = rangeType;
		view = adapter.automationSheetState(item);
		assert.equal(view.area, true);
		assert.equal(view.wall, false);
	}
	config.placementMode = "summon";
	view = adapter.automationSheetState(item);
	assert.equal(view.area, false);
	assert.equal(view.showTargetCount, false);
	assert.equal(view.invalidSummon, true);
	item.hasAttack = false;
	assert.equal(adapter.automationSheetState(item).canSummon, true);
	assert.equal(adapter.automationSheetState(item).invalidSummon, false);
	delete config.placementMode;
	item.system.rangeType = "wall";
	assert.equal(adapter.automationSheetState(item).wall, true);
	assert.equal(config.targetCount, 3);
	assert.equal(config.wallHeight, 4);
	assert.equal(config.placeRegion, true);
	assert.equal(config.includeCaster, true);
});

test("weapon range follows selected melee/ranged mode, reach and normal/long range", async () => {
	const adapter = loadAdapter({ id: "spear", system: { isRanged: false, properties: { thv: true, rch: true }, range: { value: 5, long: 10 } } });
	const item = { actor: {}, system: { rangeType: "weapon", weaponType: "melee", rangePower: "" }, getRollData: () => ({ item: {} }) };
	assert.equal((await adapter.resolveRange(item)).maximum, 2);
	assert.equal((await adapter.resolveRange(item)).mode, "melee");
	item.system.weaponType = "ranged";
	const range = await adapter.resolveRange(item);
	assert.equal(range.mode, "ranged");
	assert.equal(range.normal, 5);
	assert.equal(range.maximum, 10);
	assert.equal(range.weaponId, "spear");
	item.system.weaponType = "melee";
	item.system.rangePower = "@reach";
	assert.equal((await adapter.resolveRange(item)).normal, 3);
});

test("melee touch stays at one square regardless of weapon reach or range formula", async () => {
	const adapter = loadAdapter({ id: "spear", system: { properties: { rch: true } } });
	const item = { actor: {}, system: { rangeType: "touch", rangePower: "" }, getRollData: () => ({ item: {} }) };
	for (const formula of ["", "@reach", "invalid"]) {
		item.system.rangePower = formula;
		const range = await adapter.resolveRange(item);
		assert.equal(range.normal, 1);
		assert.equal(range.maximum, 1);
		assert.equal(range.mode, "melee");
		assert.equal(range.weaponId, "spear");
	}
});

test("explicit formula ranges and long range are evaluated; invalid formula results are rejected", async () => {
	const adapter = loadAdapter();
	const item = { actor: {}, system: { rangeType: "range", rangePower: "@reach", range: { long: "10" } }, getRollData: () => ({ item: {} }) };
	assert.equal((await adapter.resolveRange(item)).normal, 3);
	assert.equal((await adapter.resolveRange(item)).maximum, 10);
	item.system.rangePower = "not a range";
	await assert.rejects(adapter.resolveRange(item), /positive, whole-square range/);
});

test("melee reach evaluates the power range without a ranged long-range extension", async () => {
	const adapter = loadAdapter();
	const item = { actor: {}, system: { rangeType: "reach", rangePower: "2", range: { long: "10" } }, getRollData: () => ({ item: {} }) };
	for (const [formula, expected] of [["2", 2], ["@reach", 3]]) {
		item.system.rangePower = formula;
		const range = await adapter.resolveRange(item);
		assert.equal(range.normal, expected);
		assert.equal(range.maximum, expected);
		assert.equal(range.mode, "melee");
	}
	item.system.rangePower = "invalid";
	await assert.rejects(adapter.resolveRange(item), /positive, whole-square range/);
});

test("native area fields resolve formulas independently of weapon reach and target distance", async () => {
	const adapter = loadAdapter();
	for (const shape of ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast"]) {
		const item = { actor: {}, system: { rangeType: shape, area: "@reach", rangePower: "10" } };
		const range = await adapter.resolveRange(item);
		assert.equal(range.shape, shape);
		assert.equal(range.area, 3);
		assert.equal(range.maximum, shape.startsWith("close") ? 3 : 10);
		assert.equal(range.mode, "area");
		item.system.area = "1.5";
		await assert.rejects(adapter.resolveRange(item), /whole-square area/);
	}
});

test("turn/round power uses are not consumed outside combat; encounter uses are", async () => {
	const adapter = loadAdapter();
	let spent = 0;
	const item = { system: { uses: { per: "turn", value: 2 } }, update: async () => { spent++; } };
	await adapter.commitPowerUse(item);
	assert.equal(spent, 0);
	item.system.uses.per = "encounter";
	await adapter.commitPowerUse(item);
	assert.equal(spent, 1);
});

test("card-use costs honor permissions and exhausted uses before asking the native consumer", async () => {
	const adapter = loadAdapter();
	let calls = 0;
	const item = {
		isOwner: true, actor: { isOwner: true }, system: { uses: { per: "encounter", value: 0 } },
		_handleResourceConsumption: async options => { calls++; assert.equal(options.isCard, true); assert.equal(options.isAttack, false); return true; },
	};
	await assert.rejects(adapter.commitCardCosts(item), /no uses remaining/);
	assert.equal(calls, 0);
	item.system.uses.value = 1;
	assert.equal(await adapter.commitCardCosts(item), true);
	assert.equal(calls, 1);
});

test("informational card rendering uses a read-only native template and never the item use/roll methods", async () => {
	const source = readFileSync(new URL("../scripts/power-activation/cards.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
	let templateContext;
	const messages = [];
	const item = {
		actor: { uuid: "Actor.a" }, system: { autoGenChatPowerCard: true, useType: "daily" }, uuid: "Actor.a.Item.p",
		hasAttack: true,
		getChatData: async () => ({}), getRollData: () => ({}), toObject: () => ({ name: "Power" }),
		roll: () => assert.fail("Preview must not execute Item.roll"),
	};
	const context = vm.createContext({
		MODULE_ID, FLAG, AREA_TYPES, automationConfig: item => automationConfig({ getFlag: () => ({}), ...item }),
		MODULE_ID: "dnd4e-health-display",
		foundry: { applications: {
			handlebars: { renderTemplate: async (path, data) => { templateContext = data; return "card"; } },
			ux: { TextEditor: { implementation: { enrichHTML: async html => html } } },
		} },
		document: { createElement: () => ({ innerHTML: "", querySelectorAll: () => [] }) },
		game: { user: { id: "author" }, modules: { get: () => ({ active: false }) }, settings: { get: () => "self" } },
		CONST: { CHAT_MESSAGE_STYLES: { OTHER: 0 } },
		ChatMessage: { getSpeaker: () => ({}), create: async data => { messages.push(data); return { id: "card" }; } },
	});
	vm.runInContext(`${source}\nglobalThis.api = { renderPowerCard, createPowerMessage };`, context);
	const html = await context.api.renderPowerCard(item, { preparePowerCardData: () => "rules" });
	assert.equal(templateContext.isRoll, false);
	assert.equal(templateContext.effects, false);
	assert.equal(templateContext.hasAttack, false);
	const message = await context.api.createPowerMessage(item, html, "session");
	assert.equal(message.id, "card");
	assert.equal(messages[0].flags["dnd4e-health-display"].powerActivation.provisional, true);
	assert.equal(messages[0].whisper[0], "author");
	await context.api.renderPowerCard(item, { preparePowerCardData: () => "rules" }, { showActions: true });
	assert.equal(templateContext.isRoll, true);
	assert.equal(templateContext.hasAttack, true);
});


test("the native Automation tab accepts actor drops, deduplicates the whitelist and respects read-only sheets", async () => {
	class Sheet {
		static PARTS = {};
		static TABS = { sheet: { tabs: [] } };
		async _preparePartContext(part, context) { return context; }
		_onDrop() { return "native"; }
		async _onRender() {}
	}
	const config = {};
	const errors = [];
	const source = readFileSync(new URL("../scripts/power-activation/system-adapter.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")
		.replace('const { default: Sheet } = await import("../../../../systems/dnd4e/module/applications/sheets/item-sheet.mjs");', 'const Sheet = globalThis.Sheet;');
	const context = vm.createContext({ Sheet, MODULE_ID, FLAG, automationConfig, Hooks: { on() {} },
		foundry: { applications: { ux: { TextEditor: { implementation: { getDragEventData: () => ({ type: "Actor" }) } } } } },
		Actor: { implementation: { fromDropData: async () => ({ uuid: "Actor.summon" }) } },
		ui: { notifications: { error: message => errors.push(message) } },
	});
	vm.runInContext(source + "\nglobalThis.register = registerAutomationTab;", context);
	await context.register();
	const sheet = new Sheet();
	sheet.document = { type: "power", getFlag: () => config, setFlag: async (module, path, value) => { config[path.split(".")[1]] = value; } };
	sheet.isEditable = true;
	sheet.render = async () => {};
	const event = key => ({ preventDefault() {}, target: { closest: () => ({ dataset: { automationActor: key } }) } });
	await sheet._onDrop(event("summonActor"));
	assert.equal(config.summonActor, "Actor.summon");
	await sheet._onDrop(event("originActors"));
	await sheet._onDrop(event("originActors"));
	assert.deepEqual(Array.from(config.originActors), ["Actor.summon"]);
	sheet.isEditable = false;
	config.summonActor = "";
	await sheet._onDrop(event("summonActor"));
	assert.equal(config.summonActor, "");
	assert.equal(await sheet._onDrop({ target: { closest: () => null } }), "native");
	assert.deepEqual(errors, []);
});
