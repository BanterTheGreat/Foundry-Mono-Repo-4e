import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { messageAttackResults } from "../scripts/power-activation/attack-results.js";
import { MODULE_ID, SETTING } from "../scripts/power-activation/rules.js";

const source = readFileSync(new URL("../scripts/power-activation/attack-effects.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Exercise the real reconciliation loop with document collections and the native apply helper boundary. */
function fixture() {
	let serial = 0;
	const calls = [];
	const actor = id => ({ uuid: `Actor.${id}`, isOwner: true, effects: [], prototypeToken: { disposition: 1 },
		testUserPermission: () => true,
		async deleteEmbeddedDocuments(type, ids) {
			assert.equal(type, "ActiveEffect");
			this.effects = this.effects.filter(effect => !ids.includes(effect.id));
		},
	});
	const caster = { id: "caster", actor: actor("caster"), disposition: 1 };
	const target = { id: "target", actor: actor("target"), disposition: -1 };
	const other = { id: "other", actor: actor("other"), disposition: -1 };
	const conditions = ["hit", "miss", "hitOrMiss", "all", "enemies", "self", "selfHit", "selfMiss", "selfAfterAttack"];
	const effects = conditions.map(condition => ({ id: condition, system: { powerEffectType: condition },
		toObject: () => ({ name: condition, system: { powerEffectType: condition }, flags: {} }),
	}));
	effects.size = effects.length;
	const item = { uuid: "Actor.caster.Item.power", actor: caster.actor, effects, hasAttack: true, testUserPermission: () => true };
	const tokens = new Map([caster, target, other].map(token => [token.id, token]));
	const scene = { id: "scene", tokens: { get: id => tokens.get(id), [Symbol.iterator]: () => tokens.values() } };
	const message = { id: "attack", author: { id: "player" },
		flags: { [MODULE_ID]: { attackResults: { sessionId: "session", sceneId: "scene", itemUuid: item.uuid,
			casterId: "caster", effectsManaged: true, targetIds: ["target", "other"] } } },
		rolls: [{ total: 20, options: { multirollData: { targetID: "target", hitstate: "hit" } } },
			{ total: 20, options: { multirollData: { targetID: "other", hitstate: "miss" } } }],
	};
	const context = vm.createContext({ setTimeout, clearTimeout, MODULE_ID, SETTING, messageAttackResults, automationConfig: () => ({ enabled: true }),
		fromUuid: async () => item,
		game: { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" }, get: id => id === "player" ? { id, active: true } : null },
			scenes: new Map([["scene", scene]]), messages: new Map([["attack", message]]),
			settings: { get: () => true },
		},
		loadSystem: async () => ({ async applyEffectsToTokens(sources, targets, condition, parent) {
			assert.equal(parent, caster.actor);
			for (const token of targets) {
				for (const effect of sources) {
					const data = effect.toObject();
					assert.equal(data.system.powerEffectType, condition);
					token.actor.effects.push({ ...data, id: `effect-${++serial}` });
					calls.push([token.id, condition]);
				}
			}
		} }),
	});
	vm.runInContext(`${source}\nglobalThis.api = { reconcileAttackEffects, syncAttackEffects, registerAttackEffects };`, context);
	const request = { userId: "player", sessionId: "session", sceneId: "scene", itemUuid: item.uuid, messageIds: ["attack"] };
	return { context, request, item, caster, target, other, message, calls,
		sync: () => context.api.reconcileAttackEffects(request) };
}

const names = actor => actor.effects.map(effect => effect.name).sort();

test("hit to miss and back swaps target and conditional self effects without duplicating shared effects", async () => {
	const f = fixture();
	const unrelated = { id: "unrelated", name: "Unrelated hit", flags: {} };
	f.target.actor.effects.push(unrelated);
	await f.sync();
	assert.deepEqual(names(f.target.actor), ["Unrelated hit", "all", "enemies", "hit", "hitOrMiss"].sort());
	assert.deepEqual(names(f.caster.actor), ["self", "selfAfterAttack", "selfHit", "selfMiss"]);
	const shared = f.target.actor.effects.find(effect => effect.name === "hitOrMiss");
	const previousCalls = f.calls.length;
	await f.sync();
	assert.equal(f.calls.length, previousCalls, "repeated sync must not apply effects again");
	f.message.rolls[0].options.multirollData.hitstate = "miss";
	await f.sync();
	assert.deepEqual(names(f.target.actor), ["Unrelated hit", "all", "enemies", "hitOrMiss", "miss"].sort());
	assert.deepEqual(names(f.caster.actor), ["self", "selfAfterAttack", "selfMiss"]);
	assert.equal(f.target.actor.effects.find(effect => effect.name === "hitOrMiss"), shared);
	assert.ok(f.target.actor.effects.includes(unrelated));
	f.message.rolls[0].options.multirollData.hitstate = "hit";
	await f.sync();
	assert.deepEqual(names(f.target.actor), ["Unrelated hit", "all", "enemies", "hit", "hitOrMiss"].sort());
	assert.deepEqual(names(f.caster.actor), ["self", "selfAfterAttack", "selfHit", "selfMiss"]);
});

test("removing targets deletes their session effects and conditional self effects while preserving other sessions", async () => {
	const f = fixture();
	await f.sync();
	const foreign = { id: "foreign", name: "Earlier attack", flags: { [MODULE_ID]: { attackEffect: {
		sessionId: "earlier", itemUuid: f.item.uuid, key: "target:hit:hit",
	} } } };
	f.target.actor.effects.push(foreign);
	f.message.flags[MODULE_ID].attackResults.targetIds = ["other"];
	f.message.rolls.shift();
	await f.sync();
	assert.deepEqual(f.target.actor.effects, [foreign]);
	assert.deepEqual(names(f.other.actor), ["all", "enemies", "hitOrMiss", "miss"]);
	assert.deepEqual(names(f.caster.actor), ["self", "selfAfterAttack", "selfMiss"]);
	f.message.flags[MODULE_ID].attackResults.targetIds = [];
	f.message.rolls = [];
	await f.sync();
	assert.deepEqual(f.other.actor.effects, []);
	assert.deepEqual(names(f.caster.actor), ["self", "selfAfterAttack"]);
});

test("critical and fumble overrides determine effects, and immunity gets neither hit nor miss effects", async () => {
	for (const [critstate, expected] of [["critical", "hit"], ["fumble", "miss"], ["immune", null]]) {
		const f = fixture();
		f.message.rolls[0].options.multirollData.critstate = critstate;
		await f.sync();
		assert.equal(names(f.target.actor).includes("hit"), expected === "hit");
		assert.equal(names(f.target.actor).includes("miss"), expected === "miss");
		assert.equal(names(f.target.actor).includes("hitOrMiss"), expected !== null);
	}
});

test("reconciliation refuses foreign messages, powers, scenes, casters and missing ownership before modifying effects", async () => {
	for (const corrupt of [f => { f.message.author.id = "other"; }, f => { f.item.testUserPermission = () => false; },
		f => { f.message.flags[MODULE_ID].attackResults.sessionId = "foreign"; },
		f => { f.message.flags[MODULE_ID].attackResults.itemUuid = "foreign"; },
		f => { f.message.flags[MODULE_ID].attackResults.casterId = "missing"; },
		f => { f.request.sceneId = "missing"; }, f => { f.message.flags[MODULE_ID].attackResults.effectsManaged = false; }]) {
		const f = fixture();
		corrupt(f);
		await assert.rejects(f.sync());
		assert.equal(f.calls.length, 0);
		assert.equal(f.target.actor.effects.length, 0);
	}
});

test("a partial apply failure can be retried without recreating already applied effects", async () => {
	const f = fixture();
	const native = await f.context.loadSystem();
	let fails = true;
	f.context.loadSystem = async () => ({ async applyEffectsToTokens(...args) {
		if (fails && args[2] === "hit") {
			throw new Error("Apply failed");
		}
		return native.applyEffectsToTokens(...args);
	} });
	await assert.rejects(f.sync(), /Apply failed/);
	const self = f.caster.actor.effects.find(effect => effect.name === "self");
	fails = false;
	await f.sync();
	assert.equal(f.caster.actor.effects.find(effect => effect.name === "self"), self);
	assert.equal(names(f.target.actor).filter(name => name === "hit").length, 1);
});


test("player effect updates await the elected GM reply and do not send effect data", async () => {
	const f = fixture();
	f.context.game.user = { id: "player", isGM: false };
	f.context.canvas = { scene: { id: "scene" } };
	f.context.foundry = { utils: { randomID: () => "request" } };
	let handler;
	let request;
	f.context.game.socket = { on(channel, callback) { handler = callback; }, emit(channel, payload) { request = payload; } };
	f.context.api.registerAttackEffects();
	let settled = false;
	const pending = f.context.api.syncAttackEffects({ item: f.item, id: "session", attackMessages: [f.message] }).then(() => { settled = true; });
	await Promise.resolve();
	assert.equal(settled, false);
	assert.equal(request.type, "attackEffectsRequest");
	assert.equal(request.gmId, "gm");
	assert.deepEqual(Array.from(request.messageIds), ["attack"]);
	assert.equal(request.effects, undefined);
	await handler({ type: "attackEffectsResult", userId: "player", requestId: "request", gmId: "other" });
	assert.equal(settled, false);
	await handler({ type: "attackEffectsResult", userId: "player", requestId: "request", gmId: "gm" });
	await pending;
	assert.equal(settled, true);
});

test("GM socket handling applies effects before acknowledging and surfaces permission errors", async () => {
	const f = fixture();
	let handler;
	const replies = [];
	f.context.game.socket = { on(channel, callback) { handler = callback; }, emit(channel, payload) { replies.push(payload); } };
	f.context.api.registerAttackEffects();
	const request = { ...f.request, type: "attackEffectsRequest", gmId: "gm", requestId: "request" };
	await handler(request);
	assert.ok(f.target.actor.effects.some(effect => effect.name === "hit"));
	assert.equal(replies[0].error, undefined);
	const count = f.calls.length;
	await handler(request);
	assert.equal(f.calls.length, count, "duplicate socket delivery must not duplicate effects");
	f.message.author.id = "foreign";
	await handler({ ...request, requestId: "denied" });
	assert.match(replies.at(-1).error, /match/);
	assert.equal(f.calls.length, count);
});


test("without a GM, an owner can reconcile owned actors but cannot mutate unowned targets", async () => {
	const f = fixture();
	f.context.game.user = { id: "player", isGM: false };
	await f.sync();
	assert.ok(f.target.actor.effects.some(effect => effect.name === "hit"));
	f.target.actor.isOwner = false;
	f.message.rolls[0].options.multirollData.hitstate = "miss";
	const count = f.calls.length;
	await assert.rejects(f.sync(), /GM must be logged in/);
	assert.equal(f.calls.length, count);
	assert.ok(f.target.actor.effects.some(effect => effect.name === "hit"), "permissions are checked before deleting effects");
});


test("managed defenses defer effects until confirmation, use defense outcomes, and finalize once", async () => {
	const f = fixture();
	const ended = [];
	const triggered = [];
	const utils = await f.context.loadSystem();
	utils.endEffectsOnTokens = async (tokens, condition) => ended.push(condition);
	f.context.loadSystem = async () => utils;
	f.context.game.TriggerPrompts = { handleActiveDefenseOutcome: async (context, outcome) => triggered.push([context.targetTokenId, outcome]) };
	f.item.system = { attack: { def: "ac" } };
	f.message.update = async data => {
		f.message.flags[MODULE_ID].attackResults.finalizedTargetIds = data[`flags.${MODULE_ID}.attackResults.finalizedTargetIds`];
	};
	f.message.rolls.shift();
	const target = { tokenId: "target", resolved: false };
	f.message.flags.playerDefense = { automationManaged: true, targets: [target] };
	await f.sync();
	assert.equal(f.calls.length, 0);
	f.request.finalize = true;
	await assert.rejects(f.sync(), /Wait for every player defense/);
	Object.assign(target, { resolved: true, outcome: "critical", total: 3 });
	await f.sync();
	assert.ok(names(f.target.actor).includes("hit"));
	assert.ok(names(f.other.actor).includes("miss"));
	assert.deepEqual(ended, ["attackedhit", "attacked"]);
	assert.deepEqual(triggered.sort(), [["other", "miss"], ["target", "hit"]]);
	const applied = f.calls.length;
	await f.sync();
	assert.equal(f.calls.length, applied);
	assert.equal(ended.length, 2);
	assert.equal(triggered.length, 2);
});

/** Two creatures use their own copies of the power on the same target, one hitting and one missing. */
function groupFixture(outcomes = ["hit", "miss"]) {
	const f = fixture();
	const second = { id: "caster2", actor: { ...f.caster.actor, uuid: "Actor.caster2", effects: [] }, disposition: 1 };
	f.context.game.scenes.get("scene").tokens.get = id => ({ caster: f.caster, caster2: second, target: f.target, other: f.other })[id];
	const attack = (id, casterId, itemUuid, outcome) => ({ id, author: { id: "player" }, flags: { [MODULE_ID]: { attackResults: {
		sessionId: "session", sceneId: "scene", itemUuid, casterId, effectsManaged: true, groupSize: 2, targetIds: ["target"] } } },
		rolls: [{ total: 20, options: { multirollData: { targetID: "target", hitstate: outcome } } }] });
	const first = attack("attack", "caster", f.item.uuid, outcomes[0]);
	const other = attack("attack2", "caster2", "Actor.caster2.Item.power", outcomes[1]);
	f.context.game.messages.set("attack", first);
	f.context.game.messages.set("attack2", other);
	const request = { ...f.request, messageIds: ["attack", "attack2"] };
	return { ...f, second, first, other, sync: () => f.context.api.reconcileAttackEffects(request) };
}

test("a multi-attack applies hit effects when any attacker hits and gives each attacker its own self effects", async () => {
	const g = groupFixture(["hit", "miss"]);
	await g.sync();
	assert.deepEqual(names(g.target.actor), ["all", "enemies", "hit", "hitOrMiss"].sort(), "one hit is enough; the other attacker's miss adds no miss effect");
	assert.deepEqual(names(g.caster.actor), ["self", "selfAfterAttack", "selfHit"]);
	assert.deepEqual(names(g.second.actor), ["self", "selfAfterAttack", "selfMiss"]);
});

test("a multi-attack applies miss effects only when every attack on the target missed", async () => {
	const g = groupFixture(["miss", "miss"]);
	await g.sync();
	assert.deepEqual(names(g.target.actor), ["all", "enemies", "hitOrMiss", "miss"].sort());
	assert.deepEqual(names(g.caster.actor), ["self", "selfAfterAttack", "selfMiss"]);
	assert.deepEqual(names(g.second.actor), ["self", "selfAfterAttack", "selfMiss"]);
});

test("a multi-attack accepts each creature's own power copy but a single attack still rejects a foreign item", async () => {
	const g = groupFixture(["hit", "hit"]);
	await assert.doesNotReject(g.sync());
	const single = fixture();
	single.message.flags[MODULE_ID].attackResults.itemUuid = "Actor.other.Item.power";
	await assert.rejects(single.sync(), /no longer match/);
});
