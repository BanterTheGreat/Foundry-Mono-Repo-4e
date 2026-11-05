import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("item equip controls always use state icons with accessible toggle labels", () => {
	const template = readFileSync(new URL("../scripts/actor-display/actor-display.hbs", import.meta.url), "utf8");
	const button = template.match(/<button[^>]*data-action="toggleEquip"[^>]*>(.*?)<\/button>/s);
	assert.ok(button);
	assert.equal(button[1], '<i class="fa-solid {{#if equipped}}fa-check{{else}}fa-shirt{{/if}}" aria-hidden="true"></i>');
	assert.ok(button[0].includes('aria-label="{{#if equipped}}Unequip{{else}}Equip{{/if}} {{name}}"'));
	assert.ok(button[0].includes('aria-pressed="{{#if equipped}}true{{else}}false{{/if}}"'));
	assert.ok(button[0].includes('title="{{#if equipped}}Equipped; click to unequip{{else}}Equip{{/if}}"'));
});

const source = readFileSync(new URL("../scripts/actor-display/actor-display.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");

/** Load the controller against a minimal application host without running Foundry. */
function loadController(data = {}, overrides = {}) {
	const settings = new Map();
	const hooks = new Map();
	let renders = 0;
	const context = vm.createContext({
		bindPowerHitChanceHover: () => () => {},
		Hooks: { on: (name, callback) => hooks.set(name, callback) },
		ui: { Dnd4eActorDisplay: { render: () => { renders++; } } },
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
		getNpcPowerHints: () => ({ actionLabel: "Standard", conditionSummary: "Dazed", weakSummary: "Mira", hasPowerHints: true }),
		canvas: { tokens: { placeables: [] } },
		generateSystemTooltip: async (_actor, item) => `<p>${item.name} rules</p>`,
		game: { settings: {
			register: (_module, key, config) => settings.set(key, config),
			get: (_module, key) => key === "showHorizontalActorDisplay",
		} },
		...overrides,
	});
	vm.runInContext(`${source}\nglobalThis.controller = { ActorDisplay, registerActorDisplaySettings, registerActorDisplay };`, context);
	return { ...context.controller, settings, hooks, renderCount: () => renders };
}

test("NPC hints refresh on token identity/disposition changes without rerendering during movement", () => {
	const { registerActorDisplay, hooks, renderCount } = loadController();
	registerActorDisplay();
	const update = hooks.get("updateToken");
	update({}, { x: 100, y: 200 });
	assert.equal(renderCount(), 0);
	for (const key of ["name", "disposition", "actorId", "actorLink", "delta"]) {
		update({}, { [key]: "changed" });
	}
	assert.equal(renderCount(), 5);
});

test("Actor HUD is enabled by default and retains the existing visibility preference", () => {
 const { registerActorDisplaySettings, settings } = loadController();
 registerActorDisplaySettings();
 assert.equal(settings.has("experimentalActorHud"), false);
 const setting = settings.get("showHorizontalActorDisplay");
 assert.equal(setting.name, "Show Actor HUD");
 assert.equal(setting.default, true);
 assert.equal(setting.scope, "client");
});

test("right-clicking a floating power row opens its embedded sheet and stops action dispatch", () => {
	const { ActorDisplay } = loadController();
	const display = Object.create(ActorDisplay.prototype);
	const listeners = new Map();
	const opened = [];
	const row = { dataset: { itemId: "power" }, addEventListener: (name, callback) => listeners.set(name, callback) };
	const items = new Map([["power", { sheet: { render: force => opened.push(force) } }]]);
	display.token = { actor: { items } };
	display.element = { querySelectorAll: () => [row] };
	display.initializePowerContextMenus();
	assert.deepEqual([...listeners.keys()], ["contextmenu"]);
	let prevented = 0;
	let stopped = 0;
	const event = { preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; } };
	listeners.get("contextmenu")(event);
	assert.deepEqual(opened, [true]);
	assert.equal(prevented, 1);
	assert.equal(stopped, 1);
	items.delete("power");
	assert.doesNotThrow(() => listeners.get("contextmenu")(event));
	assert.deepEqual(opened, [true]);
});

test("four action groups retain move, rest and unclassified powers under Other without opening a list", async () => {
	const categories = ["standard", "minor", "reaction", "move", "rest", "other"].map((key) => ({
		key, powers: [{ id: key }],
	}));
	const { ActorDisplay } = loadController({ powerCategories: categories });
	const display = Object.create(ActorDisplay.prototype);
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




test("NPC menus merge all powers and feats into Sheet", async () => {
	const { ActorDisplay } = loadController({
		powerCategories: [{ key: "standard", powers: [{ id: "attack" }] },
			{ key: "move", powers: [{ id: "move" }] }],
	});
	const display = Object.create(ActorDisplay.prototype);
	display.token = { actor: { type: "NPC", items: new Map([["attack", { id: "attack" }], ["move", { id: "move" }]]) } };
	display.activeTab = display.getInitialTab(display.token);
	assert.equal(display.activeTab, "sheet");
	const context = await display._prepareContext({});
	assert.equal(context.isNpcSheet, true);
	assert.equal(context.categories.length, 0);
	assert.equal(context.selectedMenu, null);
	assert.deepEqual(Array.from(context.selectedCategory.powers, (power) => power.id), ["attack", "move"]);
	assert.deepEqual(Array.from(context.menus, (menu) => menu.name), ["Skills", "Items", "Extras"]);
	assert.equal(context.sheetMenu.active, true);
	assert.equal(context.selectedCategory.powers[0].actionLabel, "Standard");
	assert.equal(context.selectedCategory.powers[0].weakSummary, "Mira");
});

test("NPC feats start expanded up to two and collapsed above two", async () => {
	for (const count of [1, 2, 3, 4]) {
		const { ActorDisplay } = loadController({ powerCategories: [] });
		const items = Array.from({ length: count }, (_, id) => ({ id: String(id), name: `Feat ${id}`, type: "feature" }));
		items.get = (id) => items.find((item) => item.id === id);
		const display = Object.create(ActorDisplay.prototype);
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


test("targeting buttons are disabled for depleted powers in the main HUD lists", () => {
	const template = readFileSync(new URL("../scripts/actor-display/actor-display.hbs", import.meta.url), "utf8");
	const buttons = template.match(/<button[^>]*data-action="power"[^>]*>/g);
	assert.ok(buttons.length > 0);
	for (const button of buttons) {
	assert.ok(button.includes("{{#if depleted}}disabled{{/if}}"));
	}
	for (const value of [0, -1]) {
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 1, value } } }), true);
	}
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 1, value: 1 } } }), false);
	assert.equal(presentation.isPowerDepleted({ system: { uses: { max: 0, value: 0 } } }), false);
	});


test("NPC Sheet awaits the native attack bonus and adds percentages to listed PCs", async () => {
	let calls = 0;
	const item = { id: "attack", name: "Test", async getAttackBonus() { calls++; return 10; } };
	const { ActorDisplay } = loadController({ powerCategories: [{ key: "standard", powers: [{ id: "attack" }] }] }, {
		getNpcPowerHints: () => ({ weakTargets: [{ name: "Mira", value: 20 }], weakSummary: "Mira", weakTooltip: "Reflex" }),
		formatPowerHitChances: (targets, bonus) => { assert.equal(bonus, 10); return targets[0].name + " (55%)"; },
	});
	const display = Object.create(ActorDisplay.prototype);
	display.token = { actor: { type: "NPC", items: new Map([[item.id, item]]) } };
	display.activeTab = "sheet";
	const context = await display._prepareContext({});
	assert.equal(context.selectedCategory.powers[0].weakSummary, "Mira (55%)");
	assert.match(context.selectedCategory.powers[0].weakTooltip, /situational modifiers/);
	assert.equal(calls, 1);
});

test("only NPC Sheet renders bind range hover, and rerenders release its previous binding", () => {
	const bindings = [];
	let cleared = 0;
	const { ActorDisplay } = loadController({}, {
		bindPowerRangeHover: (...args) => { bindings.push(args); return () => { cleared++; }; },
		isPowerActivationActive: () => false,
		document: { getElementById: () => null, body: {} },
	});
	const base = Object.getPrototypeOf(ActorDisplay.prototype);
	base._onRender = () => {};
	ActorDisplay.prototype.initializeHudSearch = () => {};
	const display = Object.create(ActorDisplay.prototype);
	display.token = { actor: {} };
	display.element = {};
	display.layoutObserver = { disconnect() {}, observe() {} };
	display.positionAboveHotbar = () => {};
	display.trackHotbarPosition = () => {};
	display._onRender({ isNpcSheet: false }, {});
	assert.equal(bindings.length, 0);
	display._onRender({ isNpcSheet: true }, {});
	assert.equal(bindings.length, 1);
	assert.equal(bindings[0][0], display.element);
	assert.equal(bindings[0][1], display.actor);
	assert.equal(bindings[0][2], display.token);
	display.clearPowerRangeHover();
	assert.equal(cleared, 1);
});


test("NPC Sheet groups Basic Attacks first without losing powers or reordering within a group", async () => {
	for (const flags of [[false, true, false, true], [false, false], [true, true], []]) {
		const powers = flags.map((isBasic, id) => ({ id: String(id), type: "power", name: `Power ${id}`, system: { attack: { isBasic } } }));
		const items = [...powers];
		items.get = id => items.find(item => item.id === id);
		const { ActorDisplay } = loadController({ powerCategories: [{ key: "standard", powers: powers.map(({ id }) => ({ id })) }] });
		const display = Object.create(ActorDisplay.prototype);
		display.token = { actor: { type: "NPC", items } };
		display.activeTab = "sheet";
		const context = await display._prepareContext({});
		const rows = context.selectedCategory.powers;
		assert.deepEqual(Array.from(rows, row => row.id), [...powers.filter(p => p.system.attack.isBasic), ...powers.filter(p => !p.system.attack.isBasic)].map(p => p.id));
		assert.deepEqual(Array.from(rows, row => row.npcPowerGroup).filter(Boolean), [
			...(flags.includes(true) ? ["Basic Attacks"] : []), ...(flags.includes(false) ? ["Other Powers"] : []),
		]);
	}
});

/** Existing clients must get both parts without consulting the removed opt-in. */
test("the main HUD follows selection, refreshes both parts and respects visibility", () => {
	for (const enabled of [true, false]) {
		const token = { actor: { id: "pc", type: "Player Character" } };
		const selected = [];
		let refreshed = 0;
		let closed = 0;
		const part = () => ({ actor: token.actor, setToken: value => selected.push(value),
			render: () => { refreshed++; }, close: () => { closed++; } });
		const ui = { Dnd4eActorDisplay: part(), Dnd4eActorPortrait: part() };
		const { registerActorDisplay, hooks } = loadController({}, {
			ui,
			canvas: { ready: true, tokens: { controlled: [token] } },
			window: { clearTimeout() {} },
			game: { user: { isGM: false }, settings: { get: (_module, key) => {
				assert.equal(key, "showHorizontalActorDisplay");
				return enabled;
			} } },
		});
		registerActorDisplay();
		if (enabled) {
			assert.deepEqual(selected, [token, token]);
			hooks.get("updateActor")(token.actor);
			assert.equal(refreshed, 2);
			hooks.get("canvasTearDown")();
		}
		assert.equal(closed, 2);
		assert.equal(ui.Dnd4eActorDisplay, null);
		assert.equal(ui.Dnd4eActorPortrait, null);
	}
});

test("End Turn is text-only above AP for PCs regardless of user role and retains combat gating", () => {
	const template = readFileSync(new URL("../scripts/actor-display/actor-display.hbs", import.meta.url), "utf8");
	const portrait = readFileSync(new URL("../scripts/actor-display/actor-portrait.hbs", import.meta.url), "utf8");
	const controls = template.match(/<div class="dnd4e-actor-display__action-point-controls">(.*?)<\/div>/s)?.[1];
	assert.ok(controls);
	assert.match(controls, /{{#if isPlayerCharacter}}\s*{{#if isInCombat}}\s*<button[^>]*data-command="endTurn"[^>]*>\s*End Turn\s*<\/button>\s*{{\/if}}\s*{{\/if}}/);
	assert.equal(controls.includes('fa-hourglass-end'), false);
	assert.ok(controls.includes('data-command="endTurn" {{#unless isCurrentTurn}}disabled{{/unless}}'));
	assert.ok(controls.includes('data-command="actionPoint"'));
	assert.equal(template.includes("isGM"), false);
	assert.equal(portrait.includes('data-command="endTurn"'), false);
	const css = readFileSync(new URL("../styles/actor-display.css", import.meta.url), "utf8");
	const anchor = css.match(/\.dnd4e-actor-display__action-point-controls \{([^}]+)\}/)?.[1];
	assert.match(anchor, /position: relative/);
	const turn = css.match(/\.dnd4e-actor-display__categories \.dnd4e-horizontal-actor-display__end-turn \{([^}]+)\}/)?.[1];
	assert.match(turn, /bottom: calc\(100% \+ 8px\)/);
	assert.match(turn, /left: 50%/);
	assert.match(turn, /transform: translateX\(-50%\)/);
});

/** Build a controlled NPC token for multi-selection tests. */
function npcToken(id, actorId = "goblin", hp = { value: 10, max: 20 }) {
	return { id, name: `Goblin ${id}`, document: { actorId }, actor: { id: actorId, type: "NPC", system: { attributes: { hp } } } };
}

/** Run the selection hook for a controlled-token list and report what each HUD part received. */
function renderSelection(controlled, isGM = true) {
	const selected = [];
	let closed = 0;
	const part = () => ({ actor: controlled[0]?.actor, setToken: (token, tokens) => selected.push({ token, tokens }),
		render: () => {}, close: () => { closed++; } });
	const ui = { Dnd4eActorDisplay: part(), Dnd4eActorPortrait: part() };
	const { registerActorDisplay } = loadController({}, {
		ui,
		canvas: { ready: true, tokens: { controlled, placeables: [] } },
		window: { clearTimeout() {} },
		game: { user: { isGM }, settings: { get: () => true } },
	});
	registerActorDisplay();
	return { selected, closed };
}

test("GMs get one HUD for several tokens of the same NPC type, led by the first controlled token", () => {
	const tokens = [npcToken("a"), npcToken("b"), npcToken("c")];
	const { selected, closed } = renderSelection(tokens);
	assert.equal(closed, 0);
	assert.equal(selected.length, 2);
	for (const call of selected) {
		assert.equal(call.token, tokens[0]);
		assert.deepEqual(Array.from(call.tokens), tokens);
	}
});

test("mixed creature types, player characters and non-GM multi-selections do not show a group HUD", () => {
	for (const [tokens, isGM] of [
		[[npcToken("a", "goblin"), npcToken("b", "orc")], true],
		[[npcToken("a"), { ...npcToken("b"), actor: { id: "goblin", type: "Player Character" } }], true],
		[[npcToken("a"), npcToken("b")], false],
	]) {
		const { selected, closed } = renderSelection(tokens, isGM);
		assert.equal(selected.length, 0);
		assert.equal(closed, 2);
	}
});

test("group HUD context names the count, adds a bar per creature and offers Use Power only for group-capable powers", async () => {
	const tokens = [npcToken("a", "goblin", { value: 5, max: 20 }), npcToken("b"), npcToken("c")];
	const power = { id: "attack", canTargetAutomation: true };
	const item = { id: "attack", name: "Attack", type: "power", system: { rangeType: "closeBurst" } };
	const items = [item];
	items.get = id => items.find(entry => entry.id === id);
	tokens[0].actor.items = items;
	const { ActorDisplay } = loadController({ name: "Goblin", powerCategories: [{ key: "standard", powers: [power] }] }, {
		getGroupHealthBars: (list) => list.map(token => ({ id: token.id })),
		supportsGroupAttack: (power) => power.system.rangeType === "melee",
	});
	const display = Object.create(ActorDisplay.prototype);
	display.token = tokens[0];
	display.tokens = tokens;
	display.activeTab = "sheet";
	const context = await display._prepareContext({});
	assert.equal(context.isGroup, true);
	assert.equal(context.name, "3 creatures selected");
	assert.deepEqual(Array.from(context.groupBars, bar => bar.id), ["a", "b", "c"]);
	assert.equal(context.selectedCategory.powers[0].canTargetAutomation, false, "area powers stay manual for a group");
	item.system.rangeType = "melee";
	assert.equal((await display._prepareContext({})).selectedCategory.powers[0].canTargetAutomation, true, "melee powers support a group");

	display.tokens = [tokens[0]];
	const single = await display._prepareContext({});
	assert.equal(single.isGroup, false);
	assert.equal(single.selectedCategory.powers[0].canTargetAutomation, true);
});

test("group HUD starts a group attack for supported powers, blocks the rest and chats the first creature's power", async () => {
	const chatted = [];
	const used = [];
	const item = { id: "attack", actor: { type: "NPC" }, system: { rangeType: "melee" } };
	let supported = true;
	const { ActorDisplay } = loadController({}, {
		showPowerInChat: (power) => { chatted.push(power); },
		useAbility: async (power, token, tokens) => { used.push([power, token, tokens]); return true; },
		supportsGroupAttack: () => supported,
	});
	const display = Object.create(ActorDisplay.prototype);
	display.token = { actor: { items: new Map([["attack", item]]) } };
	display.tokens = [display.token, { actor: { items: new Map() } }];
	display.onClosePowers = () => {};
	await display.onPower({ button: 0 }, { dataset: { itemId: "attack" } });
	assert.equal(used.length, 1);
	assert.equal(used[0][1], display.token);
	assert.equal(used[0][2], display.tokens, "the whole selection is handed to the activation");
	supported = false;
	await display.onPower({ button: 0 }, { dataset: { itemId: "attack" } });
	assert.equal(used.length, 1, "unsupported powers never start");
	await display.onChatPower({ button: 0 }, { dataset: { itemId: "attack" } });
	assert.deepEqual(chatted, [item]);
});

test("group HUD data builds exact per-creature bars", () => {
	const bars = presentation.getGroupHealthBars([npcToken("a", "goblin", { value: 10, max: 20 }), npcToken("b", "goblin", { value: -5, max: 0 })]);
	assert.equal(bars.length, 2);
	assert.deepEqual(Array.from(bars[0].barSegments, segment => segment.percent), [100, 100, 0, 0]);
	assert.ok(bars[1].barSegments.every(segment => segment.percent === 0));
});

test("group HUD templates hide Temp HP and everything except the Sheet menu", () => {
	const portrait = readFileSync(new URL("../scripts/actor-display/actor-portrait.hbs", import.meta.url), "utf8");
	const template = readFileSync(new URL("../scripts/actor-display/actor-display.hbs", import.meta.url), "utf8");
	assert.match(portrait, /{{#unless isGroup}}\s*<div class="dnd4e-horizontal-actor-display__portrait-body">/);
	assert.match(portrait, /{{#each groupBars}}/);
	const groupBranch = portrait.match(/{{#if isGroup}}(.*?){{else}}/s)[1];
	assert.equal(groupBranch.includes("temp"), false);
	assert.equal(groupBranch.includes("data-resource-path"), false);
	assert.match(template, /{{#unless isGroup}}\s*<div class="dnd4e-actor-display__quick-actions"/);
	assert.match(template, /<\/div>\s*{{\/unless}}\s*<\/nav>/);
	assert.ok(template.indexOf('data-display-tab="sheet"') < template.indexOf("{{#unless isGroup}}"));
});


test("Extras preparation menus are exclusive to Wizard PCs", () => {
	for (const [type, className, visible] of [
		["Player Character", "Wizard", true],
		["Player Character", " wizard ", true],
		["Player Character", "Fighter", false],
		["Player Character", "Hybrid Wizard", false],
		["Player Character", undefined, false],
		["NPC", "Wizard", false],
	]) {
		const actions = presentation.getHorizontalActions({ type, system: { details: { class: className } } });
		assert.equal(actions.preparation.length, visible ? 2 : 0);
		if (visible) {
			assert.equal(actions.preparation[0].label, "Prepare Dailies");
			assert.equal(actions.preparation[1].label, "Prepare Utilities");
		}
	}
});


/** Create a class power with the DnD4e 0.9.3 preparation fields. */
function spell(id, fields = {}) {
	return { id, name: id, type: "power", system: {
		powerType: "class", powerSubtype: "attack", useType: "daily", level: 1,
		prepared: false, ...fields,
	} };
}

/** Supply only globals needed by normal PC power mapping. */
function preparationActor(level, items = []) {
	presentation.game = { settings: { get: () => false } };
	presentation.TARGET_AUTOMATION_SETTING = "targetAutomation";
	return { type: "Player Character", system: { details: { class: "Wizard", level } }, items };
}

test("Wizard preparation limits match every Modern 4e level", async () => {
	for (let level = 1; level <= 30; level++) {
		const actor = preparationActor(level);
		const daily = await presentation.getSpellbookPreparation(actor, "daily");
		const utility = await presentation.getSpellbookPreparation(actor, "utility");
		assert.equal(daily.limit, level < 5 ? 2 : 3);
		assert.equal(utility.limit, [2, 6, 10, 16, 22].filter(threshold => level >= threshold).length);
	}
});

test("preparation includes unprepared class spells, separates utilities, excludes non-spellbook powers", async () => {
	const actor = preparationActor(10, [
		spell("Daily", { prepared: true }), spell("Reserve"),
		spell("Utility", { powerSubtype: "utility", useType: "encounter" }),
		spell("Cantrip", { level: 0, powerSubtype: "utility" }),
		spell("Future", { level: 15 }), spell("Racial", { powerType: "race" }),
		spell("Path", { powerType: "paragon" }), spell("Encounter", { useType: "encounter" }),
	]);
	const daily = await presentation.getSpellbookPreparation(actor, "daily");
	assert.deepEqual(Array.from(daily.powers, p => p.id), ["Daily", "Reserve"]);
	assert.equal(daily.count, 1);
	assert.equal(daily.powers[0].prepared, true);
	assert.equal(daily.powers[1].prepared, false);
	assert.equal(daily.powers[0].usageClass, "is-daily");
	const utility = await presentation.getSpellbookPreparation(actor, "utility");
	assert.deepEqual(Array.from(utility.powers, p => p.id), ["Utility"]);
	actor.system.details.class = "Fighter";
	assert.equal(await presentation.getSpellbookPreparation(actor, "daily"), null);
});

test("at and above the preparation limit, removing remains available and adding is blocked", async () => {
	const actor = preparationActor(1, [spell("A", { prepared: true }), spell("B", { prepared: true }), spell("C")]);
	let menu = await presentation.getSpellbookPreparation(actor, "daily");
	assert.equal(menu.powers.find(p => p.id === "C").preparationDisabled, true);
	assert.equal(menu.powers.find(p => p.id === "A").preparationDisabled, false);
	actor.items[0].system.prepared = false;
	menu = await presentation.getSpellbookPreparation(actor, "daily");
	assert.equal(menu.powers.find(p => p.id === "C").preparationDisabled, false);
});

test("preparation writes the native prepared flag, prevents concurrent clicks and retains scroll state", async () => {
	const { ActorDisplay } = loadController({}, { getSpellbookPreparation: presentation.getSpellbookPreparation });
	const display = Object.create(ActorDisplay.prototype);
	const item = spell("Reserve");
	let release;
	item.update = async update => { await new Promise(resolve => { release = resolve; }); Object.assign(item.system, { prepared: update["system.prepared"] }); };
	const actor = preparationActor(10, [item]);
	actor.items.get = id => actor.items.find(item => item.id === id);
	display.token = { actor };
	display.activeTab = "prepareDailies";
	display.savedScrollTop = 102;
	let renders = 0;
	display.render = async () => { renders++; };
	const pending = display.onTogglePreparation({}, { dataset: { itemId: item.id } });
	await new Promise(resolve => setImmediate(resolve));
	await display.onTogglePreparation({}, { dataset: { itemId: item.id } });
	assert.equal(display.preparationPending, true);
	release();
	await pending;
	assert.equal(item.system.prepared, true);
	assert.equal(display.savedScrollTop, 102);
	assert.equal(display.activeTab, "prepareDailies");
	assert.equal(renders, 1);
	assert.equal(display.preparationPending, false);
});


test("preparation controller rejects unavailable powers and over-limit additions", async () => {
	const { ActorDisplay } = loadController({}, { getSpellbookPreparation: presentation.getSpellbookPreparation });
	const display = Object.create(ActorDisplay.prototype);
	const items = [spell("A", { prepared: true }), spell("B", { prepared: true }), spell("C")];
	let writes = 0;
	items.forEach(item => { item.update = async () => { writes++; }; });
	const actor = preparationActor(1, items);
	actor.items.get = id => items.find(item => item.id === id);
	display.token = { actor };
	display.activeTab = "prepareDailies";
	display.render = async () => {};
	await display.onTogglePreparation({}, { dataset: { itemId: "C" } });
	await display.onTogglePreparation({}, { dataset: { itemId: "missing" } });
	assert.equal(writes, 0);
	await display.onTogglePreparation({}, { dataset: { itemId: "A" } });
	assert.equal(writes, 1, "unpreparing remains allowed at the limit");
});


test("preparation rows show the NPC action label on the right", async () => {
	const power = { id: "spell", name: "Spell" };
	const { ActorDisplay } = loadController({ powerCategories: [] }, {
		getSpellbookPreparation: async () => ({ name: "Prepare Utilities", powers: [power] }),
		getNpcPowerHints: item => ({ actionLabel: item.system.actionType === "interrupt" ? "Interrupt" : "Other" }),
	});
	const display = Object.create(ActorDisplay.prototype);
	display.token = { actor: { items: new Map([["spell", { system: { actionType: "interrupt" } }]]) } };
	display.activeTab = "prepareUtilities";
	const context = await display._prepareContext({});
	assert.equal(context.selectedCategory.powers[0].actionLabel, "Interrupt");
	const template = readFileSync(new URL("../scripts/actor-display/actor-display.hbs", import.meta.url), "utf8");
	assert.match(template, /{{#if @root.isPreparation}}\s*<span class="dnd4e-actor-display__npc-power-action">{{actionLabel}}<\/span>/);
});
