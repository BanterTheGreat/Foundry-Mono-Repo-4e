import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as data from "../scripts/combat-ledger/ledger-data.js";

/** Minimal real DnD4e 0.9.3 actor/token identities for the recording boundary. */
function combatFixture() {
	const make = (id, type, disposition) => {
		const actor = { id, uuid: `Actor.${id}`, name: id, type,
			system: { attributes: { hp: { value: 100, max: 100 }, temphp: { value: 10 } }, details: { surges: { value: 8, max: 10 } } } };
		return { id, actor, tokenId: id, token: { id, uuid: `Scene.scene.Token.${id}`, name: id,
			actorId: id, disposition, actor, parent: { id: "scene", name: "Scene" } } };
	};
	const hero = make("hero", "Player Character", 1);
	const summon = make("summon", "NPC", 1);
	const enemy = make("enemy", "NPC", -1);
	const combat = { id: "combat", name: "Encounter", scene: { id: "scene" }, round: 1, turn: 0,
		started: true, combatants: [hero, summon, enemy], combatant: hero };
	const report = data.createReport(combat, 1000, false);
	for (const combatant of combat.combatants) {
		data.ensureParticipant(report, data.participantData(combatant));
	}
	report.turn = { key: hero.token.uuid, elapsedMs: 0, contemplatingMs: 0, acted: false };
	return { hero, summon, enemy, combat, report };
}

/** Keep the standard native roll shape; kept/discarded results exercise the real averaging seam. */
function attackMessage({ id = "attack", target = "enemy", outcome = "hit", natural = 16, pending = false } = {}) {
	return { id, timestamp: 1001, speaker: { actor: "hero", token: "hero", scene: "scene" },
		flags: { [data.MODULE_ID]: { attackResults: { sessionId: "session", casterId: "hero", sceneId: "scene", targetIds: [target], pending } } },
		rolls: [{ options: { multirollData: { targetID: target, hitstate: outcome } },
			dice: [{ faces: 20, results: [{ result: natural, active: true }, { result: 2, discarded: true }] }] }] };
}

test("turn and contemplation clocks exclude pauses and stop only for that turn token", () => {
	const { report, hero, summon } = combatFixture();
	data.markActivity(report, summon.token.uuid, 2000);
	assert.equal(report.turn.acted, false);
	data.tickReport(report, 3000);
	report.paused = true;
	data.tickReport(report, 6000);
	report.paused = false;
	data.markActivity(report, hero.token.uuid, 7000);
	data.tickReport(report, 11000);
	data.finishTurn(report);
	const row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.turns, 1);
	assert.equal(row.turnMs, 7000);
	assert.equal(row.contemplatingMs, 3000);
	assert.equal(report.elapsedMs, 7000);
});

test("a no-action turn is all contemplation; an active turn is excluded from averages", () => {
	const { report } = combatFixture();
	data.tickReport(report, 11000);
	let row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.turns, 0);
	assert.equal(row.activeContemplatingMs, 10000);
	data.finishTurn(report);
	row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.contemplatingMs, row.turnMs);
});

test("confirmation and edited attack results replace one message instead of counting twice", () => {
	const { report } = combatFixture();
	const message = attackMessage({ pending: true });
	data.recordMessage(report, message);
	let row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.attempts, 0);
	assert.equal(row.unknown, 1);
	message.flags[data.MODULE_ID].attackResults.pending = false;
	data.recordMessage(report, message);
	data.recordMessage(report, message);
	row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.attempts, 1);
	assert.equal(row.hit, 1);
	assert.equal(row.d20Count, 1);
	message.rolls[0].options.multirollData.hitstate = "miss";
	data.recordMessage(report, message);
	row = data.reportRows(report).find(row => row.name === "hero");
	assert.equal(row.hit, 0);
	assert.equal(row.attempts, 1);
	assert.equal(data.reportRows(report).find(row => row.name === "enemy").received, 0);
});

test("ordinary native chat without automation flags counts targeted attacks", () => {
	const { report } = combatFixture();
	const message = attackMessage();
	message.flags = {};
	data.recordMessage(report, message);
	assert.equal(data.reportRows(report).find(row => row.name === "hero").hit, 1);
});

test("attacks from another scene do not pollute this combat", () => {
	const { report } = combatFixture();
	const message = attackMessage();
	message.flags[data.MODULE_ID].attackResults.sceneId = "elsewhere";
	assert.equal(data.recordMessage(report, message), false);
	assert.deepEqual(report.attacks, {});
});

test("managed and ordinary active defense credit hits to the attacker and natural dice to the defender", () => {
	for (const managed of [true, false]) {
		const { report } = combatFixture();
		const message = { id: "defense", flags: { playerDefense: { attackerId: "enemy", attackerTokenId: "enemy", sceneId: "scene",
			automationManaged: managed, targets: [{ tokenId: "hero", actorId: "hero", sceneId: "scene", resolved: true, outcome: "normal", natural: 4 }] } },
			rolls: managed ? [{ options: { banterDefenseTarget: "hero" }, dice: [{ faces: 20, results: [{ result: 4 }] }] }] : [] };
		data.recordMessage(report, message);
		data.recordMessage(report, message);
		let rows = data.reportRows(report);
		assert.equal(rows.find(row => row.name === "enemy").hit, 1);
		assert.equal(rows.find(row => row.name === "enemy").d20Count, 0);
		assert.equal(rows.find(row => row.name === "hero").received, 1);
		assert.equal(rows.find(row => row.name === "hero").d20Sum, 4);
		message.flags.playerDefense.targets[0].outcome = "miss";
		data.recordMessage(report, message);
		rows = data.reportRows(report);
		assert.equal(rows.find(row => row.name === "enemy").hit, 0);
		assert.equal(rows.find(row => row.name === "hero").incoming, 1);
	}
});

test("HP plus temp loss is counted once, zero crossings kill once, healing adds no damage", () => {
	const { report, hero, enemy } = combatFixture();
	const target = report.participants[enemy.token.uuid];
	data.recordHealth(report, target, { ...data.actorResources(enemy.actor), hp: 80, temp: 0 }, hero.token.uuid, true);
	assert.equal(report.participants[hero.token.uuid].damage, 30);
	data.recordHealth(report, target, { ...target, hp: 80 }, hero.token.uuid, true);
	assert.equal(report.participants[hero.token.uuid].damage, 30);
	data.recordHealth(report, target, { ...target, hp: 0 }, hero.token.uuid, false);
	assert.equal(report.participants[hero.token.uuid].slain, 1);
	data.recordHealth(report, target, { ...target, hp: 10 }, hero.token.uuid, true);
	data.recordHealth(report, target, { ...target, hp: 0 }, hero.token.uuid, true);
	assert.equal(report.participants[hero.token.uuid].slain, 1);
	assert.equal(report.participants[hero.token.uuid].damage, 120);
	assert.equal(report.participants[hero.token.uuid].estimatedDamage, 40);
	assert.equal(report.rounds[0].playerDamage, 120);
});

test("no source means unattributed damage instead of guessed team credit", () => {
	const { report, enemy } = combatFixture();
	data.recordHealth(report, report.participants[enemy.token.uuid], { ...data.actorResources(enemy.actor), hp: 90 }, undefined, true);
	assert.equal(report.unattributedDamage, 10);
	assert.equal(report.rounds[0].playerDamage, 0);
	assert.equal(report.rounds[0].unattributedDamage, 10);
});

test("bindings hide companion rows and aggregate totals with weighted turn and d20 averages", () => {
	const { report, hero, summon } = combatFixture();
	report.participants[hero.token.uuid].turns = [{ elapsedMs: 10000, contemplatingMs: 2000 }, { elapsedMs: 20000, contemplatingMs: 4000 }];
	report.participants[summon.token.uuid].turns = [{ elapsedMs: 6000, contemplatingMs: 3000 }];
	report.participants[summon.token.uuid].damage = 24;
	data.recordMessage(report, attackMessage());
	const summonMessage = attackMessage({ id: "summon-attack", natural: 10 });
	summonMessage.speaker.actor = "summon";
	summonMessage.speaker.token = "summon";
	summonMessage.flags[data.MODULE_ID].attackResults.casterId = "summon";
	data.recordMessage(report, summonMessage);
	const binding = [{ source: summon.actor.uuid, owner: hero.actor.uuid }];
	const rows = data.reportRows(report, binding);
	assert.equal(rows.length, 2);
	const row = rows.find(row => row.name === "hero");
	assert.equal(row.turns, 3);
	assert.equal(row.turnMs / row.turns, 12000);
	assert.equal(row.contemplatingMs / row.turns, 3000);
	assert.equal(row.d20Sum / row.d20Count, 13);
	assert.equal(row.hit, 2);
	assert.equal(row.damage, 24);
	assert.deepEqual(row.includes, ["summon"]);
	assert.equal(data.reportRows(report).length, 3);
});

test("token bindings override actor bindings and enemy bindings cannot hide enemies", () => {
	const { report, summon, hero, enemy } = combatFixture();
	const bindings = [{ source: summon.actor.uuid, owner: hero.actor.uuid },
		{ source: summon.token.uuid, owner: "Actor.other" }, { source: enemy.actor.uuid, owner: hero.actor.uuid }];
	const rows = data.reportRows(report, bindings, { "Actor.other": "Other PC" });
	assert.equal(rows.find(row => row.name === "Other PC").includes[0], "summon");
	assert.ok(rows.some(row => row.name === "enemy"));
});

test("resource graphs sum maxima and exclude summons, keeping defeated enemies in the denominator", () => {
	const { report, hero, summon, enemy } = combatFixture();
	report.participants[hero.token.uuid].hp = 50;
	report.participants[summon.token.uuid].maxHp = 1000;
	report.participants[enemy.token.uuid].hp = 0;
	assert.deepEqual(data.resourceSnapshot(report), { playerHp: 50, playerSurges: 80, enemyHp: 0 });
});

const controllerSource = readFileSync(new URL("../scripts/combat-ledger/combat-ledger.js", import.meta.url), "utf8")
	.replace(/^import[\s\S]*?from ".*?";\r?\n/gm, "").replace(/^export \{.*\} from .*;\r?\n/gm, "").replace(/^export /gm, "");
const uiSource = readFileSync(new URL("../scripts/combat-ledger/ledger-ui.js", import.meta.url), "utf8")
	.replace(/^import[\s\S]*?from ".*?";\r?\n/gm, "").replace(/^export /gm, "");

/** Collections iterate documents, as Foundry Collections do. */
function collection(entries = []) {
	const map = new Map(entries.map(entry => [entry.id, entry]));
	map[Symbol.iterator] = map.values;
	map.find = predicate => [...map.values()].find(predicate);
	return map;
}

/** Exercise the actual controller registrations, storage, and document observers. */
function controllerHarness({ rejectStorage = false, rejectWrites = 0, initialStorage = null } = {}) {
	const hooks = new Map();
	const scheduled = [];
	const warnings = [];
	const fixture = combatFixture();
	let services;
	let writeCount = 0;
	let stored;
	const setFlag = async (module, key, value) => {
		writeCount++;
		if (rejectWrites-- > 0) {
			throw Error("write rejected");
		}
		assert.equal(typeof value, "string", "flag storage must protect dotted UUID keys");
		stored = JSON.parse(value);
	};
	const creations = [];
	const game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, paused: false,
		system: { id: "dnd4e" }, settings: { get: () => ({ bindings: [] }) },
		journal: collection(), combats: collection([fixture.combat]), messages: collection(), socket: { on() {} },
		scenes: new Map([["scene", { tokens: fixture.combat.combatants.map(entry => entry.token) }]]) };
	if (initialStorage) {
		game.journal.set("stored", { id: "stored", flags: { [data.MODULE_ID]: { combatLedgerStorage: true, combatLedger: initialStorage } }, setFlag });
	}
	const context = vm.createContext({ ...data, structuredClone, Date, console: { warn: (...args) => warnings.push(args) },
		game, ui: { combat: { render() {} } },
		Hooks: { on(name, callback) { const list = hooks.get(name) ?? []; list.push(callback); hooks.set(name, list); } },
		configureLedgerUI: value => { services = value; }, addLedgerButton() {}, refreshLedger() {},
		setTimeout: callback => { scheduled.push(callback); return scheduled.length; }, setInterval() {},
		JournalEntry: { async create(payload) {
			creations.push(payload);
			if (rejectStorage) {
				throw new Error("disk unavailable");
			}
			const journal = { id: "journal", setFlag };
			game.journal.set(journal.id, journal);
			return journal;
		} },
	});
	vm.runInContext(controllerSource + '\nglobalThis.api = { registerCombatLedger, observeLedger, saveLedger };', context);
	context.api.registerCombatLedger();
	return { ...fixture, context, game, hooks, scheduled, warnings, creations, get services() { return services; },
		get writeCount() { return writeCount; }, get stored() { return stored; },
		emit(name, ...args) { return (hooks.get(name) ?? []).map(callback => callback(...args)); } };
}

test("storage rejection leaves data in memory and never interrupts a combat or actor update", async () => {
	const h = controllerHarness({ rejectStorage: true });
	h.enemy.actor.system.attributes.hp.value = 70;
	assert.deepEqual(h.emit("updateActor", h.enemy.actor), [undefined]);
	h.combat.combatant = h.enemy;
	h.combat.turn = 1;
	assert.deepEqual(h.emit("updateCombat", h.combat, { turn: 1 }), [undefined]);
	await assert.doesNotReject(() => h.context.api.saveLedger());
	assert.equal(h.services.getState().storageError, true);
	assert.equal(h.services.getState().dirty, true);
	assert.equal(Object.values(h.services.getState().reports)[0].participants[h.hero.token.uuid].damage, 30);
	assert.ok(h.warnings.length);
});

test("throwing and asynchronously rejected observers never cancel their original event", async () => {
	const h = controllerHarness();
	assert.equal(h.context.api.observeLedger(() => false)(), undefined);
	assert.equal(h.context.api.observeLedger(() => { throw Error("bad statistic"); })(), undefined);
	assert.equal(h.context.api.observeLedger(async () => { throw Error("async statistic"); })(), undefined);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(h.warnings.length, 2);
});

test("multiple saves serialize a single private record, and ending/deleting combat preserves the last report", async () => {
	const h = controllerHarness();
	await Promise.all([h.context.api.saveLedger(), h.context.api.saveLedger()]);
	assert.equal(h.writeCount, 1);
	h.emit("deleteCombat", h.combat);
	await h.context.api.saveLedger();
	assert.ok(h.stored.lastReportId);
	assert.ok(h.stored.reports[h.stored.lastReportId].endedAt);
	assert.equal(h.stored.reports[h.stored.lastReportId].participants[h.hero.token.uuid].turns.length, 1);
});

test("non-elected GMs never record duplicate HP changes or save", async () => {
	const h = controllerHarness();
	h.game.users.activeGM.id = "other-gm";
	h.enemy.actor.system.attributes.hp.value = 50;
	h.emit("updateActor", h.enemy.actor);
	await h.context.api.saveLedger();
	assert.equal(h.writeCount, 0);
	assert.equal(Object.values(h.services.getState().reports)[0].participants[h.hero.token.uuid].damage, 0);
});

test("known Apply Damage receipts attribute off-turn damage to its source, not the current turn", () => {
	const h = controllerHarness();
	h.game.messages.set("receipt", { id: "receipt", speaker: { actor: "summon", token: "summon" }, flags: { [data.MODULE_ID]: {
		attackResults: { casterId: "summon" }, damageApplication: { sceneId: "scene" },
		damageApplications: { enemy: { state: "applying", health: { before: 100, tempBefore: 10, after: 70, tempAfter: 0 } } },
	} } });
	h.enemy.actor.system.attributes.hp.value = 70;
	h.enemy.actor.system.attributes.temphp.value = 0;
	h.emit("updateActor", h.enemy.actor);
	const report = Object.values(h.services.getState().reports)[0];
	assert.equal(report.participants[h.summon.token.uuid].damage, 40);
	assert.equal(report.participants[h.summon.token.uuid].estimatedDamage, 0);
	assert.equal(report.participants[h.hero.token.uuid].damage, 0);
});

/** Load actual UI helpers with only the Foundry application shell stubbed. */
function uiHarness() {
	const main = {};
	const appended = [];
	const document = { createElement: () => ({ dataset: {}, addEventListener() {} }) };
	const context = vm.createContext({ ...data, structuredClone, document, console,
		foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: base => base } } },
		game: { user: { isGM: true } }, ui: { combat: main },
	});
	vm.runInContext(uiSource + '\nglobalThis.api = { addLedgerButton, validateBindings, ledgerChart, CombatLedger, configureLedgerUI };', context);
	const element = { querySelector(selector) { return selector === "[data-combat-ledger]" ? null : { append: button => appended.push(button) }; } };
	return { context, main, appended, element };
}

test("Combat Ledger button is GM-only and excluded from combat popouts", () => {
	const h = uiHarness();
	h.context.api.addLedgerButton({ isPopout: true }, h.element);
	assert.equal(h.appended.length, 0);
	h.main.isPopout = true;
	h.context.api.addLedgerButton(h.main, h.element);
	assert.equal(h.appended.length, 0);
	h.main.isPopout = false;
	h.context.game.user.isGM = false;
	h.context.api.addLedgerButton(h.main, h.element);
	assert.equal(h.appended.length, 0);
	h.context.game.user.isGM = true;
	h.context.api.addLedgerButton(h.main, h.element);
	assert.equal(h.appended.length, 1);
});

test("attribution rejects duplicates, self-binding, chains and cycles", () => {
	const { api } = uiHarness().context;
	for (const bindings of [
		[{ source: "Actor.a", owner: "Actor.a" }],
		[{ source: "Actor.a", owner: "Actor.b" }, { source: "Actor.a", owner: "Actor.c" }],
		[{ source: "Actor.a", owner: "Actor.b" }, { source: "Actor.b", owner: "Actor.c" }],
		[{ source: "Actor.a", owner: "Actor.b" }, { source: "Actor.b", owner: "Actor.a" }],
	]) {
		assert.throws(() => api.validateBindings(bindings));
	}
	assert.doesNotThrow(() => api.validateBindings([{ source: "Scene.scene.Token.summon", owner: "Actor.hero" }]));
});

test("damage charts use per-round totals with a separate numeric scale and partial labels", () => {
	const { api } = uiHarness().context;
	const svg = api.ledgerChart([{ round: 0, playerDamage: 0, enemyDamage: 0 }, { round: 1, playerDamage: 123, enemyDamage: 41, partial: true }], true);
	assert.match(svg, /polyline/);
	assert.match(svg, /123 damage/);
	assert.match(svg, /41 damage/);
	assert.match(svg, /R1\*/);
	assert.doesNotMatch(svg, /%/);
});


test("rejected Journal writes retry successfully without losing intervening damage", async () => {
	const h = controllerHarness({ rejectWrites: 1 });
	await h.context.api.saveLedger();
	assert.equal(h.services.getState().storageError, true);
	h.enemy.actor.system.attributes.hp.value = 60;
	h.emit("updateActor", h.enemy.actor);
	await h.context.api.saveLedger();
	assert.equal(h.services.getState().storageError, false);
	assert.equal(h.services.getState().dirty, false);
	assert.equal(Object.values(h.stored.reports)[0].participants[h.hero.token.uuid].damage, 40);
	assert.equal(h.creations.length, 1);
	assert.equal(h.creations[0].ownership.default, 0);
});

test("a scene companion outside the tracker joins statistics only when it acts", () => {
	const h = controllerHarness();
	// This token was baselined at combat start but has not yet participated.
	const report = Object.values(h.services.getState().reports)[0];
	delete report.participants[h.summon.token.uuid];
	h.combat.combatants = [h.hero, h.enemy];
	const message = attackMessage({ id: "companion" });
	message.timestamp = Date.now() + 1;
	message.speaker = { actor: "summon", token: "summon", scene: "scene" };
	message.flags[data.MODULE_ID].attackResults.casterId = "summon";
	h.emit("createChatMessage", message);
	assert.equal(data.reportRows(report).find(row => row.name === "summon").hit, 1);
});

test("manual damage to a scene token outside the tracker uses its pre-damage baseline", () => {
	const h = controllerHarness();
	const report = Object.values(h.services.getState().reports)[0];
	delete report.participants[h.summon.token.uuid];
	h.summon.actor.system.attributes.hp.value = 70;
	h.emit("updateActor", h.summon.actor);
	assert.equal(report.participants[h.hero.token.uuid].damage, 30);
	assert.equal(report.participants[h.summon.token.uuid].hp, 70);
});

test("reload resets HP baselines without inventing offline damage or turn time", () => {
	const fixture = combatFixture();
	fixture.report.participants[fixture.enemy.token.uuid].hp = 10;
	fixture.report.elapsedMs = 20000;
	fixture.report.marker = "1:hero";
	const h = controllerHarness({ initialStorage: { version: 1, reports: { [fixture.report.id]: fixture.report }, lastReportId: null } });
	const report = Object.values(h.services.getState().reports)[0];
	assert.equal(report.gaps, true);
	assert.ok(report.elapsedMs < 21000);
	assert.equal(report.participants[h.enemy.token.uuid].hp, 100);
	h.enemy.actor.system.attributes.hp.value = 90;
	h.emit("updateActor", h.enemy.actor);
	assert.equal(report.participants[h.hero.token.uuid].damage, 10);
});

test("saved dotted token identities recover into renderable ledger rows", async () => {
	const fixture = combatFixture();
	fixture.report.marker = "1:hero";
	const participants = Object.values(fixture.report.participants);
	participants[0].turns.push({ elapsedMs: 5000, contemplatingMs: 2000 });
	fixture.report.participants = { Scene: { scene: { Token: Object.fromEntries(participants.map(entry => [entry.tokenId, entry])) } } };
	const h = controllerHarness({ initialStorage: { version: 1, reports: { [fixture.report.id]: fixture.report }, lastReportId: null } });
	const view = uiHarness();
	view.context.game.actors = fixture.combat.combatants.map(entry => entry.actor);
	view.context.game.settings = h.game.settings;
	view.context.api.configureLedgerUI(h.services);
	const result = await view.context.api.CombatLedger.prototype._prepareContext.call({});
	assert.equal(result.rows.length, 3);
	assert.equal(result.rows.find(row => row.name === "hero").avgTurn, "5s");
	await h.context.api.saveLedger();
	assert.equal(h.stored.reports[fixture.report.id].participants[fixture.hero.token.uuid].turns.length, 1);
});

test("JSON flag storage reloads completed and active participant statistics", () => {
	const fixture = combatFixture();
	fixture.report.participants[fixture.hero.token.uuid].damage = 42;
	const initialStorage = JSON.stringify({ version: 1, reports: { [fixture.report.id]: fixture.report }, lastReportId: null });
	const h = controllerHarness({ initialStorage });
	const report = Object.values(h.services.getState().reports)[0];
	assert.equal(data.reportRows(report).find(row => row.name === "hero").damage, 42);
	assert.equal(h.warnings.length, 0);
});

test("token-to-owner cycles are rejected using persisted source-actor identity", () => {
	const { api } = uiHarness().context;
	assert.throws(() => api.validateBindings([
		{ source: "Actor.a", owner: "Actor.b" },
		{ source: "Scene.scene.Token.b", sourceActor: "Actor.b", owner: "Actor.a" },
	]));
});


test("the production ledger view reads real reports, weighted attribution, and both charts", async () => {
	const h = uiHarness();
	const { report, hero, summon, enemy } = combatFixture();
	report.rounds = [{ round: 0, playerHp: 100, playerSurges: 80, enemyHp: 100, playerDamage: 0, enemyDamage: 0 },
		{ round: 1, partial: true, playerHp: 90, playerSurges: 70, enemyHp: 80, playerDamage: 24, enemyDamage: 10 }];
	report.participants[summon.token.uuid].damage = 24;
	report.participants[hero.token.uuid].turns.push({ elapsedMs: 20000, contemplatingMs: 4000 });
	report.endedAt = 30000;
	h.context.game.actors = [hero.actor, summon.actor, enemy.actor];
	h.context.game.settings = { get: () => ({ bindings: [{ source: summon.actor.uuid, owner: hero.actor.uuid }] }) };
	h.context.api.configureLedgerUI({ getState: () => ({ reports: { [report.id]: report }, lastReportId: report.id }), retry() {} });
	const result = await h.context.api.CombatLedger.prototype._prepareContext.call({});
	assert.equal(result.name, "Encounter");
	assert.equal(result.partyDamage, 24);
	assert.equal(result.rows.length, 2);
	assert.equal(result.rows.find(row => row.name === "hero").includesLabel, "summon");
	assert.equal(result.rows.find(row => row.name === "hero").avgContemplating, "4s");
	assert.match(result.resourceChart, /PC health/);
	assert.match(result.damageChart, /24 damage/);
	h.context.game.user.isGM = false;
	await assert.rejects(() => h.context.api.CombatLedger.prototype._prepareContext.call({}), /GM only/);
});
