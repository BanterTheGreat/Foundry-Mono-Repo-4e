import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/** Exercise the real version adapter against controlled system resolver/formula boundaries. */
function loadAdapter(weapon = null, combat = null) {
	const source = readFileSync(new URL("../scripts/power-activation/system-adapter.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
	const context = vm.createContext({
		utils: {
			getWeaponUse: () => weapon,
			evaluateFormula: formula => formula === "@reach" ? 3 : Number(formula),
		},
		game: { combat },
	});
	vm.runInContext(`${source}\nsystemPromise = Promise.resolve(utils); globalThis.api = {resolveRange, commitCardCosts, commitPowerUse};`, context);
	return context.api;
}

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

test("explicit formula ranges and long range are evaluated; invalid formula results are rejected", async () => {
	const adapter = loadAdapter();
	const item = { actor: {}, system: { rangeType: "range", rangePower: "@reach", range: { long: "10" } }, getRollData: () => ({ item: {} }) };
	assert.equal((await adapter.resolveRange(item)).normal, 3);
	assert.equal((await adapter.resolveRange(item)).maximum, 10);
	item.system.rangePower = "not a range";
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
