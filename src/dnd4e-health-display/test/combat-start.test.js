import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { getEncounterCalculation } from "../scripts/combat-start/encounter-calculation.js";

const controllerSource = readFileSync(new URL("../scripts/combat-start/combat-start.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");
/** Exercise Journal loading, presentation persistence, and calculations against the controller. */
function loadBriefing() {
	const flags = {};
	const combat = {
		id: "encounter",
		combatants: new Map([["enemy", { id: "enemy", actorId: "goblin" }]]),
		getFlag: (module, key) => flags[key],
		async setFlag(module, key, value) {
			flags[key] = structuredClone(value);
		},
	};
	combat.combatants[Symbol.iterator] = combat.combatants.values;
	combat.combatants.some = (predicate) => Array.from(combat.combatants.values()).some(predicate);
	const preset = {
		title: "Ambush", description: "At the gate",
		strategy: {
			environment: ["Burning ground"],
			pointers: [{ id: "pointer", actorIds: ["goblin"], notes: ["Focus the archer"] }],
		},
	};
	const context = vm.createContext({
		getEncounterCalculation,
		CONST: { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1 } },
		CONFIG: { DND4E: {} },
		canvas: {},
		foundry: {
			applications: {
				api: { ApplicationV2: class { render() {} async close() {} async _prepareContext() { return {}; } }, HandlebarsApplicationMixin: (base) => base },
				handlebars: { renderTemplate: async (path, data) => JSON.stringify(data) },
			},
			utils: { deepClone: structuredClone, randomID: () => "presentation", mergeObject: (base, data) => ({ ...base, ...data }) },
		},
		game: {
			user: { isGM: true },
			combats: new Map([[combat.id, combat]]),
			scenes: new Map(),
			folders: [{ id: "folder", type: "JournalEntry", name: "Battle Briefings" }],
			journal: [{ id: "preset", name: "Ambush", folder: { id: "folder" }, getFlag: () => preset }],
			settings: { async set() {}, get: () => "bottom" },
		},
		ui: { notifications: { warn: assert.fail } },
	});
	vm.runInContext(`${controllerSource}
	globalThis.Setup = CombatStartSetup;
	globalThis.Display = CombatStartDisplay;`, context);
	return { context, combat, preset };
}

test("legacy Journal presets retain briefing content without applying removed strategy notes", async () => {
	const { context, combat } = loadBriefing();
	const setup = new context.Setup({}, combat);
	setup.selectedPresetId = "preset";
	setup.onLoadPreset();
	await setup.onShow();
	assert.equal(combat.getFlag("dnd4e-health-display", "strategy"), undefined);
	const reopened = new context.Setup({}, combat);
	assert.equal(reopened.draft.title, "Ambush");
	assert.equal(reopened.draft.description, "At the gate");
});

test("Calculation reads the setup roster and tab switches preserve the briefing draft", async () => {
	const { context, combat } = loadBriefing();
	combat.combatants.clear();
	combat.combatants.set("hero", {
		id: "hero", name: "Hero", actorId: "hero",
		actor: { hasPlayerOwner: true, system: { details: { level: 5 } } },
	});
	const setup = new context.Setup({}, combat);
	setup.draft.title = "Keep this title";
	setup.onShowTab(null, { dataset: { tab: "calculation" } });
	const data = await setup._prepareContext({});
	assert.equal(data.showCalculation, true);
	assert.equal(JSON.parse(data.calculationHTML).partyLevel, 5);
	setup.onShowTab(null, { dataset: { tab: "briefing" } });
	assert.equal(setup.draft.title, "Keep this title");
});

test("live Calculation is available to the GM and never rendered for players", async () => {
	const { context, combat } = loadBriefing();
	const display = new context.Display({}, { combatId: combat.id });
	display.activeTab = "calculation";
	const gmData = await display._prepareContext({});
	assert.equal(gmData.showCalculation, true);
	assert.ok(gmData.calculationHTML);
	context.game.user.isGM = false;
	const playerData = await display._prepareContext({});
	assert.equal(playerData.showCalculation, false);
	assert.equal(playerData.calculationHTML, "");
	display.activeTab = "briefing";
	display.onShowTab(null, { dataset: { tab: "calculation" } });
	assert.equal(display.activeTab, "briefing");
});

test("basic briefing retains Calculation and matches PC placement to the visible tracker", async () => {
	const { context, combat } = loadBriefing();
	context.game.settings.get = () => false;
	const hero = { id: "hero", name: "Hero", initiative: 15, actor: { hasPlayerOwner: true, system: {} } };
	const enemy = { id: "enemy", name: "Enemy", initiative: 20 };
	combat.combatants.set("hero", hero);
	combat.combatants.set("enemy", enemy);
	combat.turns = [enemy, hero];
	const display = new context.Display({}, { combatId: combat.id });
	display.onShowTab(null, { dataset: { tab: "strategy" } });
	const data = await display._prepareContext({});
	assert.equal(data.showBriefing, true);
	assert.equal(data.party[0].initiativePlacement, 2);
	assert.equal(data.initiativeTrackerPlacement, "bottom");
	display.activeTab = "calculation";
	assert.equal((await display._prepareContext({})).showCalculation, true);
	context.game.settings.get = () => true;
	display.onShowTab(null, { dataset: { tab: "strategy" } });
	assert.equal(display.activeTab, "calculation", "removed tabs cannot be selected even with legacy settings enabled");
});
