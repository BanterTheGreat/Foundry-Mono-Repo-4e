import test from "node:test";
import assert from "node:assert/strict";
import { publishDamageChat } from "../scripts/power-activation/damage-chat.js";

const MODULE_ID = "dnd4e-health-display";

test("combined damage retains visibility, derives half-miss and updates the same card", async () => {
	globalThis.canvas = { scene: { id: "scene" } };
	let created = 0;
	let saved;
	const updates = [];
	globalThis.ChatMessage = { async create(data) {
		created++;
		saved = data;
		return { id: "card", async update(change) { updates.push(change); } };
	} };
	const source = type => ({ id: type, speaker: { actor: "actor" }, whisper: ["gm"], blind: true,
		flags: { [MODULE_ID]: { damageReview: { type } } }, async update(change) { updates.push(change); } });
	const session = { item: { name: "Fire" }, damageMessages: [source("normal"), source("crit")], sharedMissDamage: true, requiredDamageTypes: ["normal", "crit"] };
	const targets = [{ tokenId: "a", outcome: "hit", total: 11 }, { tokenId: "b", outcome: "fumble", total: 5 }, { tokenId: "c", outcome: "critical", total: 20 }];
	await publishDamageChat(session, targets);
	assert.equal(created, 1);
	assert.deepEqual(saved.whisper, ["gm"]);
	assert.equal(saved.blind, true);
	const layers = saved.flags[MODULE_ID].damageChat.layers;
	assert.deepEqual(layers.map(layer => layer.outcome), ["hit", "miss", "critical"]);
	assert.equal(layers[1].messageId, "normal");
	assert.equal(layers[1].half, true);
	assert.equal(layers[1].targets[0].tokenId, "b");
	await publishDamageChat(session, targets, false);
	assert.equal(created, 1);
	assert.equal(updates.find(change => change[`flags.${MODULE_ID}.damageChat`])?.[`flags.${MODULE_ID}.damageChat`].pending, false);
});

test("damage card omits outcomes without positive damage, including unconfigured miss damage", async () => {
	globalThis.canvas = { scene: { id: "scene" } };
	let saved;
	globalThis.ChatMessage = { async create(data) {
		saved = data;
		return { id: "card" };
	} };
	const source = type => ({ id: type, flags: { [MODULE_ID]: { damageReview: { type } } }, async update() {} });
	const session = { item: { name: "Strike" }, damageMessages: [source("normal"), source("crit")], sharedMissDamage: false, requiredDamageTypes: ["normal", "crit"] };
	await publishDamageChat(session, [
		{ tokenId: "a", outcome: "hit", total: 10 },
		{ tokenId: "b", outcome: "miss", total: 0 },
		{ tokenId: "c", outcome: "critical", total: 0 },
	]);
	assert.deepEqual(saved.flags[MODULE_ID].damageChat.layers.map(layer => layer.outcome), ["hit"]);
	saved = null;
	delete session.damageChat;
	await publishDamageChat(session, [{ tokenId: "b", outcome: "miss", total: 0 }]);
	assert.equal(saved, null, "do not create an empty damage card");
});

test("a multi-attack's damage card has separate layers for each attacker's own roll", async () => {
	globalThis.canvas = { scene: { id: "scene" } };
	let saved;
	globalThis.ChatMessage = { async create(data) {
		saved = data;
		return { id: "card" };
	} };
	const source = (id, attackerId, type = "normal") => ({ id, flags: { [MODULE_ID]: { damageReview: { type, attackerId } } }, async update() {} });
	const messages = [source("a-damage", "a"), source("b-damage", "b")];
	const session = { item: { name: "Claw" }, damageMessages: messages, sharedMissDamage: false, requiredDamageTypes: ["normal"],
		damageFor: attackerId => messages.filter(message => message.flags[MODULE_ID].damageReview.attackerId === attackerId) };
	await publishDamageChat(session, [
		{ tokenId: "hero", key: "a:hero", attackerId: "a", outcome: "hit", total: 7 },
		{ tokenId: "hero", key: "b:hero", attackerId: "b", outcome: "hit", total: 4 },
	]);
	const layers = saved.flags[MODULE_ID].damageChat.layers;
	assert.deepEqual(layers.map(layer => [layer.messageId, layer.targets.map(target => target.key)]), [["a-damage", ["a:hero"]], ["b-damage", ["b:hero"]]]);
});
