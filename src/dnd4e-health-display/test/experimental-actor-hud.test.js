import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../scripts/actor-display/actor-display.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");

/** Load the controller against a minimal application host without running Foundry. */
function loadController(data = {}) {
	const settings = new Map();
	const context = vm.createContext({
		foundry: {
			applications: { api: {
				ApplicationV2: class {
					async _prepareContext() { return {}; }
				},
				HandlebarsApplicationMixin: (base) => base,
			} },
			utils: { mergeObject: (left, right) => Object.assign(left, right) },
		},
		getActorDisplayData: async () => data,
		generateSystemTooltip: async (_actor, item) => `<p>${item.name} rules</p>`,
		game: { settings: {
			register: (_module, key, config) => settings.set(key, config),
			get: (_module, key) => key === "experimentalActorHud",
		} },
	});
	vm.runInContext(`${source}\nglobalThis.controller = { ExperimentalActorDisplay, HorizontalActorDisplay, registerActorDisplaySettings };`, context);
	return { ...context.controller, settings };
}

test("experimental HUD is a client opt-in and preserves existing HUD settings", () => {
	const { registerActorDisplaySettings, settings } = loadController();
	registerActorDisplaySettings();
	const setting = settings.get("experimentalActorHud");
	assert.equal(setting.name, "Experimental Actor HUD");
	assert.equal(setting.default, false);
	assert.equal(setting.scope, "client");
	assert.equal(settings.get("showHorizontalActorDisplay").default, true);
});

test("four action groups retain move, rest and unclassified powers under Other without opening a list", async () => {
	const categories = ["standard", "minor", "reaction", "move", "rest", "other"].map((key) => ({
		key, powers: [{ id: key }],
	}));
	const { ExperimentalActorDisplay } = loadController({ powerCategories: categories });
	const display = Object.create(ExperimentalActorDisplay.prototype);
	display.token = { actor: {} };
	display.activePowerCategory = null;
	const closed = await display._prepareContext({});
	assert.equal(closed.categories.length, 4);
	assert.equal(closed.selectedCategory, undefined);
	assert.deepEqual(Array.from(closed.categories[3].powers, (power) => power.id), ["move", "rest", "other"]);
	display.activePowerCategory = "reaction";
	const open = await display._prepareContext({});
	assert.equal(open.selectedCategory.key, "reaction");
	assert.equal(open.categories.filter((category) => category.active).length, 1);
});

test("experimental mode moves PC menus out of the character panel", async () => {
	const { HorizontalActorDisplay } = loadController({
		tabs: [{ key: "powers" }, { key: "skills" }, { key: "features" }, { key: "items" }],
		powerCategories: [], activeTab: "powers",
	});
	const display = Object.create(HorizontalActorDisplay.prototype);
	display.token = { actor: { type: "Player Character" } };
	display.activeTab = "powers";
	const context = await display._prepareContext({});
	assert.deepEqual(Array.from(context.tabs, (tab) => tab.key), []);
	assert.equal(context.activeTab, null);
});

const dataSource = readFileSync(new URL("../scripts/actor-display/actor-display-data.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");
const presentation = vm.createContext({});
vm.runInContext(dataSource, presentation);

test("portrait bars preserve partial HP and clamp dying and overhealed values", () => {
	const main = presentation.getHealthBarSegments(58, 71, 4);
	assert.equal(main.length, 4);
	assert.ok(Math.abs(main.reduce((total, segment) => total + segment.percent, 0) / 4 - 5800 / 71) < 0.001);
	const party = presentation.getHealthBarSegments(62, 80, 4);
	assert.deepEqual(Array.from(party.slice(0, 3), (segment) => segment.percent), [100, 100, 100]);
	assert.ok(Math.abs(party[3].percent - 10) < 0.001);
	for (const [value, maximum, expected] of [[-10, 71, 0], [100, 71, 100], [10, 0, 0]]) {
		assert.ok(presentation.getHealthBarSegments(value, maximum, 8).every((segment) => segment.percent === expected));
	}
});

test("party health labels use quarter boundaries, including zero and negative HP", () => {
	for (const [value, expected] of [[100, "Healthy"], [76, "Healthy"], [75, "Hurt"], [51, "Hurt"], [50, "Bloodied"], [26, "Bloodied"], [25, "Near Death"], [0, "Near Death"], [-10, "Near Death"]]) {
		assert.equal(presentation.getPartyHealthCondition(value, 100), expected);
	}
});

test("switching floating lists toggles them and clears the previous filter", () => {
	const { HorizontalActorDisplay } = loadController();
	const display = Object.create(HorizontalActorDisplay.prototype);
	display.render = () => {};
	display.activeTab = "skills";
	display.hudSearchQuery = "Arcana";
	display.onShowSection({ stopPropagation() {} }, { dataset: { displayTab: "items" } });
	assert.equal(display.activeTab, "items");
	assert.equal(display.hudSearchQuery, "");
	display.onShowSection({ stopPropagation() {} }, { dataset: { displayTab: "items" } });
	assert.equal(display.activeTab, null);
});

test("a tab click is not mistaken for an outside click after its button is replaced", () => {
	const { HorizontalActorDisplay } = loadController();
	const display = Object.create(HorizontalActorDisplay.prototype);
	display.activeTab = null;
	display.element = { contains: () => false, querySelector: () => ({}) };
	display.render = () => {};
	let stopped = false;
	const event = { target: {}, stopPropagation: () => { stopped = true; } };
	display.onShowSection(event, { dataset: { displayTab: "skills" } });
	// ApplicationV2 may replace the clicked button before the event reaches document.
	if (!stopped) {
		display._onDocumentClick(event);
	}
	assert.equal(display.activeTab, "skills");
});


test("NPC experimental menus merge all powers and feats into Sheet", async () => {
	const { ExperimentalActorDisplay } = loadController({
		powerCategories: [{ key: "standard", powers: [{ id: "attack" }] },
			{ key: "move", powers: [{ id: "move" }] }],
	});
	const display = Object.create(ExperimentalActorDisplay.prototype);
	display.token = { actor: { type: "NPC", items: [] } };
	display.activeTab = display.getInitialTab(display.token);
	assert.equal(display.activeTab, "sheet");
	const context = await display._prepareContext({});
	assert.equal(context.isNpcSheet, true);
	assert.equal(context.categories.length, 0);
	assert.equal(context.selectedMenu, null);
	assert.deepEqual(Array.from(context.selectedCategory.powers, (power) => power.id), ["attack", "move"]);
	assert.deepEqual(Array.from(context.menus, (menu) => menu.name), ["Skills", "Items", "Extras"]);
	assert.equal(context.sheetMenu.active, true);
});

test("NPC feats start expanded up to two and collapsed above two", async () => {
	for (const count of [1, 2, 3, 4]) {
		const { ExperimentalActorDisplay } = loadController({ powerCategories: [] });
		const items = Array.from({ length: count }, (_, id) => ({ id: String(id), name: `Feat ${id}`, type: "feature" }));
		items.get = (id) => items.find((item) => item.id === id);
		const display = Object.create(ExperimentalActorDisplay.prototype);
		display.token = { actor: { type: "NPC", items } };
		display.activeTab = "sheet";
		const context = await display._prepareContext({});
		assert.equal(context.npcFeatures.length, count);
		for (const feature of context.npcFeatures) {
			assert.equal(feature.expanded, count <= 2);
			assert.equal(feature.html, `<p>${feature.name} rules</p>`);
		}
	}
});

test("experimental mode moves NPC menus out of the portrait panel", async () => {
	const { HorizontalActorDisplay } = loadController({ tabs: [{ key: "features" }], powerCategories: [] });
	const display = Object.create(HorizontalActorDisplay.prototype);
	display.token = { actor: { type: "NPC" } };
	display.activeTab = "features";
	const context = await display._prepareContext({});
	assert.equal(context.experimentalActorHud, true);
	assert.equal(context.tabs.length, 0);
	assert.equal(context.activeTab, null);
});

test("targeting buttons are disabled for depleted powers in every horizontal HUD list", () => {
	const template = readFileSync(new URL("../scripts/actor-display/actor-display-horizontal.hbs", import.meta.url), "utf8");
	const buttons = template.match(/<button[^>]*class="[^"]*__power-use"[^>]*>/g);
	assert.equal(buttons.length, 4);
	for (const button of buttons) {
	assert.ok(button.includes("{{#if depleted}}disabled{{/if}}"));
	}
	for (const value of [0, -1]) {
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 1, value } } }), true);
	}
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 1, value: 1 } } }), false);
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 0, value: 0 } } }), false);
	});
