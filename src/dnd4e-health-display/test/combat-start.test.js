import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const controllerSource = readFileSync(new URL("../scripts/combat-start/combat-start.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");
const strategySource = readFileSync(new URL("../scripts/combat-start/strategy.js", import.meta.url), "utf8")
	.replace(/^export /gm, "");

/** Exercise Journal loading and starting against the real controller and strategy helpers. */
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
	const preset = {
		title: "Ambush", description: "At the gate",
		strategy: {
			environment: ["Burning ground"],
			pointers: [{ id: "pointer", actorIds: ["goblin"], notes: ["Focus the archer"] }],
		},
	};
	const context = vm.createContext({
		foundry: {
			applications: { api: { ApplicationV2: class { render() {} async close() {} }, HandlebarsApplicationMixin: (base) => base } },
			utils: { deepClone: structuredClone, randomID: () => "presentation", mergeObject: (base, data) => ({ ...base, ...data }) },
		},
		game: {
			folders: [{ id: "folder", type: "JournalEntry", name: "Battle Briefings" }],
			journal: [{ id: "preset", name: "Ambush", folder: { id: "folder" }, getFlag: () => preset }],
			settings: { async set() {} },
		},
		ui: { notifications: { warn: assert.fail } },
	});
	vm.runInContext(`const {getDefaultStrategy, getStrategy, setStrategy} = (() => {
		${strategySource}
		return {getDefaultStrategy, getStrategy, setStrategy};
	})();
	${controllerSource}

	globalThis.Setup = CombatStartSetup;
	globalThis.readStrategy = getStrategy;`, context);
	return { context, combat, preset };
}

test("starting a Journal briefing persists strategy for combat and reopening", async () => {
	const { context, combat, preset } = loadBriefing();
	const setup = new context.Setup({}, combat);
	setup.selectedPresetId = "preset";
	setup.onLoadPreset();
	assert.equal(setup.strategyDraft.environment[0], preset.strategy.environment[0]);
	assert.equal(setup.strategyDraft.pointers[0].combatantIds[0], "enemy");
	await setup.onShow();
	const saved = context.readStrategy(combat);
	assert.equal(saved.environment[0], "Burning ground", "combat must receive the loaded environment notes");
	assert.equal(saved.pointers[0].combatantIds[0], "enemy");
	const reopened = new context.Setup({}, combat);
	assert.equal(reopened.strategyDraft.pointers[0].notes[0], "Focus the archer");
	assert.equal(reopened.draft.title, "Ambush");
});

test("starting from the Strategy tab saves current edits and removes stale combatants", async () => {
	const { context, combat } = loadBriefing();
	const setup = new context.Setup({}, combat);
	setup.selectedPresetId = "preset";
	setup.onLoadPreset();
	setup.activeTab = "strategy";
	setup.element = {
		querySelector: () => null,
		querySelectorAll(selector) {
			if (selector === "[data-env-note]") {
				return [{ value: " Edited terrain " }, { value: " " }];
			}
			if (selector.startsWith("[data-pointer-note]")) {
				return [{ value: " Updated tactic " }];
			}
			return [{ checked: true, dataset: { tokenIds: "enemy,removed" } }];
		},
	};
	await setup.onShow();
	const saved = JSON.parse(JSON.stringify(context.readStrategy(combat)));
	assert.deepEqual(saved, {
		environment: ["Edited terrain"],
		pointers: [{ id: "pointer", combatantIds: ["enemy"], notes: ["Updated tactic"] }],
	});
});
