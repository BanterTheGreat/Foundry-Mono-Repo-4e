import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as data from "../scripts/battle-momentum/momentum-data.js";
import { getEncounterWeight } from "../scripts/combat-start/encounter-calculation.js";

/** DnD4e 0.9.3 token actors, including independent repeated enemies. */
function fixture() {
	const token = (id, pc, level = 10, rank = "standard") => ({ id, token: { disposition: pc ? 1 : -1 }, actor: {
		hasPlayerOwner: pc, statuses: new Set(), system: { details: { level, role: { secondary: rank } }, attributes: { hp: { value: 100, max: 100 } } },
	} });
	const party = Array.from({ length: 4 }, (_, i) => token(`pc${i}`, true));
	const minions = Array.from({ length: 12 }, (_, i) => token(`minion${i}`, false, 10, "minion"));
	const elite = token("elite", false, 14, "elite");
	return { id: "combat", round: 1, turn: 0, started: true, party, elite, minions, combatants: [...party, ...minions, elite] };
}

test("shared importance values one level 14 elite above twelve level 10 minions", () => {
	assert.equal(getEncounterWeight(14, "elite"), 2000);
	assert.equal(getEncounterWeight(10, "minion") * 12, 1500);
	assert.equal(getEncounterWeight(0), null);
	assert.equal(getEncounterWeight(10, "brute"), null);
});

test("conditions affect both sides without stacking shared penalties or weakening healthy minions by HP", () => {
	const c = fixture();
	const p = data.snapshotParticipant(c.elite);
	p.hp = 10;
	assert.equal(data.remainingCapacity(p), 1100);
	p.hp = 100;
	p.statuses = ["dazed"];
	assert.equal(data.remainingCapacity(p), 1400);
	p.statuses = ["dazed", "blinded"];
	assert.equal(data.remainingCapacity(p), 1200);
	p.statuses.push("stunned");
	assert.equal(data.remainingCapacity(p), 0);
	const minion = data.snapshotParticipant(c.minions[0]);
	minion.hp = 1;
	assert.equal(data.remainingCapacity(minion), 125);
	minion.hp = 0;
	assert.equal(data.remainingCapacity(minion), 0);
});

test("danger changes starting balance and removing casualties does not shrink the original roster", () => {
	const c = fixture();
	const session = data.createMomentumSession(c);
	const opening = data.observeMomentum(session, c);
	assert.equal(opening.danger, "Hard");
	assert.ok(opening.balance < 0);
	c.elite.actor.system.attributes.hp.value = 0;
	const defeated = data.observeMomentum(session, c);
	assert.ok(defeated.balance > opening.balance);
	c.combatants = c.combatants.filter(p => p.id !== "elite");
	assert.equal(data.observeMomentum(session, c).balance, defeated.balance);
	assert.equal(session.members.size, 17);
});

test("rapid knockdown and healing preserve a temporary breakthrough, with refresh and expiry", () => {
	const c = fixture();
	const session = data.createMomentumSession(c);
	data.observeMomentum(session, c);
	c.party[0].actor.system.attributes.hp.value = 0;
	assert.equal(data.observeMomentum(session, c).boost, 10);
	c.party[0].actor.system.attributes.hp.value = 25;
	assert.equal(data.observeMomentum(session, c).boost, 10);
	c.round = 2;
	data.observeMomentum(session, c);
	c.party[0].actor.system.attributes.hp.value = 0;
	assert.equal(data.observeMomentum(session, c).boost, 10);
	assert.equal(session.members.get("pc0").boostUntil, 4);
	for (const p of c.party.slice(1, 3)) {
		p.actor.system.attributes.hp.value = 0;
	}
	assert.equal(data.observeMomentum(session, c).boost, 20);
	c.round = 4;
	assert.equal(data.observeMomentum(session, c).boost, 0);
});

test("stun is not defeat, rewinds reset stale events, and incomplete rosters are unavailable", () => {
	const c = fixture();
	const session = data.createMomentumSession(c);
	data.observeMomentum(session, c);
	for (const p of c.party) {
		p.actor.statuses.add("stunned");
	}
	assert.equal(data.observeMomentum(session, c).ended, false);
	c.round = 3;
	data.observeMomentum(session, c);
	c.party[0].actor.system.attributes.hp.value = 0;
	data.observeMomentum(session, c);
	c.round = 2;
	assert.equal(data.observeMomentum(session, c).boost, 0);
	assert.equal(session.partial, true);
	c.elite.actor.system.attributes.hp.max = 0;
	assert.equal(data.observeMomentum(session, c), null);
});

test("momentum changes independently of balance and resets at a new round", () => {
	const c = fixture();
	const session = data.createMomentumSession(c);
	data.observeMomentum(session, c);
	c.elite.actor.system.attributes.hp.value = 50;
	data.observeMomentum(session, c);
	assert.match(data.momentumView(session).trend, /Party gaining/);
	c.round++;
	data.observeMomentum(session, c);
	assert.equal(data.momentumView(session).trend, "Momentum steady");
});

/** Exercise the actual controller with document-free ApplicationV2 and hook boundaries. */
function controllerHarness(isGM = true) {
	const c = fixture();
	const hooks = new Map();
	const timers = new Map();
	let nextTimer = 0;
	class Application {
		async render() {
			await this._prepareContext();
			this.rendered = true;
			this.renders = (this.renders ?? 0) + 1;
		}
		async close() { this.rendered = false; }
	}
	const context = vm.createContext({ ...data, MODULE_ID: "dnd4e-health-display", console,
		game: { user: { isGM }, combat: c, settings: { get: () => 1.5, register() {} } }, ui: { combat: { viewed: c } },
		foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: base => base } } },
		Hooks: { on(name, callback) { const list = hooks.get(name) ?? []; list.push(callback); hooks.set(name, list); } },
		setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
	});
	const source = readFileSync(new URL("../scripts/battle-momentum/battle-momentum.js", import.meta.url), "utf8")
		.replace(/^import .*;\n/gm, "").replace(/export /g, "");
	vm.runInContext(source + '\nglobalThis.api = { registerBattleMomentum, addMomentumButton, openMomentum, observeCurrentCombat, getPanel: () => panel, sessions, settled: () => refreshQueue };', context);
	return { context, c, hooks, api: context.api, async flush() {
		for (const callback of timers.values()) { callback(); }
		timers.clear();
		await context.api.settled();
	} };
}

test("native X dismissal survives HP updates and round changes; explicit reopen retains observation", async () => {
	const h = controllerHarness();
	h.api.registerBattleMomentum();
	await h.flush();
	const panel = h.api.getPanel();
	assert.equal(panel.rendered, true);
	await panel.close();
	h.c.party[0].actor.system.attributes.hp.value = 0;
	h.api.observeCurrentCombat();
	await h.flush();
	assert.equal(panel.rendered, false);
	h.c.round = 2;
	h.api.observeCurrentCombat();
	await h.flush();
	assert.equal(panel.rendered, false);
	h.api.openMomentum();
	await h.flush();
	assert.equal(h.api.getPanel(), panel);
	assert.equal(panel.rendered, true);
	assert.equal(panel.view.boost, 10);
});

test("players register no hooks and cannot open a panel; ended combat closes it", async () => {
	const player = controllerHarness(false);
	player.api.registerBattleMomentum();
	player.api.openMomentum();
	await player.flush();
	assert.equal(player.hooks.size, 0);
	assert.equal(player.api.getPanel(), undefined);
	const gm = controllerHarness();
	gm.api.registerBattleMomentum();
	await gm.flush();
	gm.c.started = false;
	gm.api.observeCurrentCombat();
	await gm.flush();
	assert.equal(gm.api.getPanel().rendered, false);
});

test("X also cancels a pending reopen, and switching encounters does not carry dismissal", async () => {
	const h = controllerHarness();
	h.api.registerBattleMomentum();
	await h.flush();
	h.api.openMomentum();
	await h.api.getPanel().close();
	await h.flush();
	assert.equal(h.api.getPanel().rendered, false);
	const next = fixture();
	next.id = "next";
	h.context.ui.combat.viewed = next;
	h.api.observeCurrentCombat();
	await h.flush();
	assert.equal(h.api.getPanel().rendered, true);
});

test("reopen icon is adjacent to statistics, unique, accessible, and restricted to the primary GM tracker", () => {
	const h = controllerHarness();
	let wrapper;
	let icon;
	const statistics = { closest: () => wrapper, before: node => { wrapper = node; } };
	h.context.document = { createElement: () => ({ dataset: {}, children: [],
		setAttribute(name, value) { this[name] = value; }, addEventListener(name, handler) { this[name] = handler; },
		append(node) { this.children.push(node); if (node.dataset?.battleMomentum !== undefined) { icon = node; } },
	}) };
	const element = { querySelector: selector => selector === "[data-combat-ledger]" ? statistics : icon };
	h.api.addMomentumButton({ isPopout: true }, element);
	assert.equal(wrapper, undefined);
	h.api.addMomentumButton(h.context.ui.combat, element);
	assert.equal(wrapper.children[0], statistics);
	assert.equal(wrapper.children[1], icon);
	assert.equal(icon["aria-label"], "Open battle momentum");
	h.api.addMomentumButton(h.context.ui.combat, element);
	assert.equal(wrapper.children.length, 2);
});

test("real ES module loading initializes the panel template without a main-entrypoint cycle", async () => {
	const { spawnSync } = await import("node:child_process");
	const controller = new URL("../scripts/battle-momentum/battle-momentum.js", import.meta.url).pathname;
	const script = `
		import vm from 'node:vm';
		import { readFileSync } from 'node:fs';
		import assert from 'node:assert/strict';
		const context = vm.createContext({ foundry: { applications: { api: {
			ApplicationV2: class {}, HandlebarsApplicationMixin: base => base
		} } } });
		const main = new vm.SourceTextModule('import { MomentumPanel } from "panel"; export const MODULE_ID = "dnd4e-health-display";', { context });
		const panel = new vm.SourceTextModule(readFileSync(${JSON.stringify(controller)}, 'utf8'), { context });
		const data = new vm.SourceTextModule('export const createMomentumSession = () => {}; export const observeMomentum = () => {}; export const momentumView = () => {};', { context });
		await main.link(specifier => specifier === 'panel' ? panel : specifier.endsWith('main.js') ? main : data);
		await main.evaluate();
		assert.equal(panel.namespace.MomentumPanel.PARTS.body.template, 'modules/dnd4e-health-display/scripts/battle-momentum/momentum.hbs');
	`;
	const result = spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", script], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
});
