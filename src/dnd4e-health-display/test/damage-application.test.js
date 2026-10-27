import test from "node:test";
import assert from "node:assert/strict";
import { requestDamageApplication, damageApplicationTargets, typedTargetDamage, projectDamage, prepareDamageTarget, applyTargetDamage } from "../scripts/power-activation/damage-application-data.js";

const MODULE_ID = "dnd4e-health-display";

/** Document fixture with live dotted updates and the native HP boundary. */
function fixture() {
	const changes = [];
	const author = { id: "player", name: "Player" };
	const actor = { uuid: "Actor.target", system: { attributes: { hp: { value: 20, max: 40 }, temphp: { value: 3 } }, details: { bloodied: 20 } },
		async calcDamageInner(parts) { return Math.max(0, parts.reduce((n, part) => n + part[0], 0) - 5); },
		async applyDamage(amount) {
			changes.push(amount);
			const health = projectDamage(this, amount);
			this.system.attributes.hp.value = health.after;
			this.system.attributes.temphp.value = health.tempAfter;
		} };
	const token = { id: "target", name: "Orc", actor, texture: { src: "orc.webp" } };
	const request = { sessionId: "session", sceneId: "scene", itemUuid: "Actor.pc.Item.power", messageIds: ["attack"], damageMessageIds: ["damage"], sharedMiss: false };
	const target = { tokenId: "target", outcome: "hit", total: 18 };
	const message = { id: "attack", author, flags: { [MODULE_ID]: {
		attackResults: { ...request, pending: false, targetIds: ["target", "miss"] },
		targetDamageReview: { sessionId: "session", pending: false, targets: [target, { tokenId: "miss", outcome: "miss", total: 0 }] },
		damageApplication: request,
	} }, async update(change) {
		for (const [path, value] of Object.entries(change)) {
			const keys = path.split(".");
			let parent = this;
			for (const key of keys.slice(0, -1)) {
				parent[key] ??= {};
				parent = parent[key];
			}
			parent[keys.at(-1)] = value;
		}
	} };
	const damage = { id: "damage", author, flags: { [MODULE_ID]: { damageReview: { sessionId: "session", pending: false, type: "normal" } } },
		rolls: [{ total: 18, terms: [{ total: 10, flavor: "cold" }, { total: 8 }], options: {} }] };
	const messages = new Map([[message.id, message], [damage.id, damage]]);
	const tokens = new Map([[token.id, token], ["miss", { ...token, id: "miss", name: "Missed Orc" }]]);
	globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, messages,
		scenes: new Map([["scene", { tokens }]]) };
	globalThis.canvas = { scene: { id: "scene" } };
	return { message, target, actor, changes, request, damage, tokens };
}

test("PC confirmation publishes a durable request including zero-damage sessions; NPCs do not", async () => {
	const f = fixture();
	const session = { id: "session", item: { name: "Cold", uuid: f.request.itemUuid, hasDamage: true,
		actor: { type: "Player Character", name: "Elara" } }, attackMessages: [f.message], damageMessages: [] };
	delete f.message.flags[MODULE_ID].damageApplication;
	await requestDamageApplication(session);
	assert.deepEqual(f.message.flags[MODULE_ID].damageApplication.damageMessageIds, []);
	assert.equal(f.message.flags[MODULE_ID].damageApplication.actorName, "Elara");
	delete f.message.flags[MODULE_ID].damageApplication;
	session.item.actor.type = "NPC";
	await requestDamageApplication(session);
	assert.equal(f.message.flags[MODULE_ID].damageApplication, undefined);
});

test("roster includes zero-damage misses and rejects foreign or unconfirmed session messages", () => {
	const f = fixture();
	assert.equal(damageApplicationTargets(f.message).length, 2);
	f.message.flags[MODULE_ID].targetDamageReview.pending = true;
	assert.deepEqual(damageApplicationTargets(f.message), []);
	f.message.flags[MODULE_ID].targetDamageReview.pending = false;
	f.message.flags[MODULE_ID].attackResults.itemUuid = "other";
	assert.deepEqual(damageApplicationTargets(f.message), []);
});

test("preview uses native mitigation, temporary HP, and the negative-bloodied floor", async () => {
	const f = fixture();
	const preview = await prepareDamageTarget(f.message, f.target);
	assert.equal(preview.amount, 13);
	assert.equal(preview.before, 20);
	assert.equal(preview.after, 10);
	assert.equal(preview.tempAfter, 0);
	assert.equal(preview.mitigated, true);
	assert.equal(projectDamage(f.actor, 100).after, -20);
	assert.equal(f.changes.length, 0);
});

test("typed damage preserves compound flavors, divisors, half miss and individual adjustments", () => {
	const f = fixture();
	f.damage.rolls[0] = { total: 25, terms: [{ total: 10, flavor: "cold,fire" }, { total: 5, flavor: "lightning" }, { total: 10 }],
		options: { hitType: "normal", divisors: { normal: { value: 2 } } } };
	f.request.sharedMiss = true;
	const parts = typedTargetDamage(f.message, { ...f.target, outcome: "miss", total: 9 });
	assert.deepEqual(parts, [[5, "cold,fire"], [4, "lightning"]]);
	const reduced = typedTargetDamage(f.message, { ...f.target, total: 3 });
	assert.equal(reduced.reduce((n, part) => n + part[0], 0), 3);
	assert.ok(reduced.every(part => part[0] > 0));
});

test("individual and repeated concurrent clicks apply once; completed receipts survive reopen", async () => {
	const f = fixture();
	await Promise.all([applyTargetDamage(f.message, "target"), applyTargetDamage(f.message, "target")]);
	await applyTargetDamage(f.message, "target");
	assert.deepEqual(f.changes, [13]);
	assert.equal(f.actor.system.attributes.hp.value, 10);
	assert.equal(f.message.flags[MODULE_ID].damageApplications.target.state, "applied");
	const preview = await prepareDamageTarget(f.message, f.target);
	assert.equal(preview.disabled, true);
	assert.equal(preview.after, 10);
});

test("separate tokens sharing a linked actor serialize and use its latest HP", async () => {
	const f = fixture();
	f.message.flags[MODULE_ID].targetDamageReview.targets[1].total = 18;
	await Promise.all([applyTargetDamage(f.message, "target"), applyTargetDamage(f.message, "miss")]);
	assert.equal(f.actor.system.attributes.hp.value, -3);
	assert.deepEqual(f.changes, [13, 13]);
});

test("zero-damage misses are recorded without invoking damage hooks", async () => {
	const f = fixture();
	await applyTargetDamage(f.message, "miss");
	assert.deepEqual(f.changes, []);
	assert.equal(f.message.flags[MODULE_ID].damageApplications.miss.state, "applied");
});

test("player and secondary GM cannot mutate HP; missing tokens cannot be applied", async () => {
	const f = fixture();
	game.user.isGM = false;
	await assert.rejects(applyTargetDamage(f.message, "target"), /active GM/);
	game.user.isGM = true;
	game.users.activeGM.id = "another";
	await assert.rejects(applyTargetDamage(f.message, "target"), /active GM/);
	game.users.activeGM.id = "gm";
	f.tokens.delete("target");
	await assert.rejects(applyTargetDamage(f.message, "target"), /unavailable/);
	assert.deepEqual(f.changes, []);
});

test("failed claim writes leave damage untouched and permit retry", async () => {
	const f = fixture();
	const update = f.message.update;
	f.message.update = async () => { throw new Error("offline"); };
	await assert.rejects(applyTargetDamage(f.message, "target"), /offline/);
	assert.deepEqual(f.changes, []);
	f.message.update = update;
	await applyTargetDamage(f.message, "target");
	assert.deepEqual(f.changes, [13]);
});

test("uncertain application failures retain a claim and cannot apply twice", async () => {
	const f = fixture();
	const apply = f.actor.applyDamage;
	f.actor.applyDamage = async amount => { await apply.call(f.actor, amount); throw new Error("lost acknowledgement"); };
	await assert.rejects(applyTargetDamage(f.message, "target"), /Check HP/);
	await applyTargetDamage(f.message, "target");
	assert.deepEqual(f.changes, [13]);
	assert.equal((await prepareDamageTarget(f.message, f.target)).uncertain, true);
});

test("a prevented native damage update stays flagged for manual review", async () => {
	const f = fixture();
	f.actor.applyDamage = async () => {};
	await assert.rejects(applyTargetDamage(f.message, "target"), /prevented/);
	assert.equal(f.message.flags[MODULE_ID].damageApplications.target.state, "applying");
});


test("large negative shared modifiers never produce negative or excess typed damage", () => {
	const f = fixture();
	f.damage.rolls[0] = { total: 10, terms: [{ total: 10, flavor: "cold" }, { total: 30, flavor: "fire" }, { total: -30 }], options: {} };
	const parts = typedTargetDamage(f.message, { ...f.target, total: 10 });
	assert.deepEqual(parts, [[10, "fire"]]);
});


test("missing required backing rolls block application rather than bypassing typed resistances", async () => {
	const f = fixture();
	game.messages.delete("damage");
	await assert.rejects(applyTargetDamage(f.message, "target"), /roll is no longer available/);
	assert.deepEqual(f.changes, []);
});
