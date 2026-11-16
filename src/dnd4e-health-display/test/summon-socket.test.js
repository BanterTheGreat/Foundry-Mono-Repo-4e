import test from "node:test";
import assert from "node:assert/strict";
import { createSummonForUser, registerSummonSocket } from "../scripts/power-activation/summon-socket.js";

test("GM rebuilds configured prototype, checks ownership, and handles duplicate requests once", async () => {
	let owned = true;
	let creations = 0;
	let listener;
	let sent;
	const actor = { documentName: "Actor", testUserPermission: () => owned,
		getTokenDocument: async data => ({ toObject: () => ({ ...data, width: 1, height: 1, actorId: "summon" }) }) };
	const item = { actor, testUserPermission: () => owned, hasAttack: false,
		getFlag: () => ({ enabled: true, placementMode: "summon", summonActor: "Actor.summon", summonMax: 2 }) };
	const scene = { tokens: new Map([["caster", { actor, elevation: 2, disposition: 1 }]]),
		dimensions: { sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } }, grid: { size: 100 },
		async createEmbeddedDocuments(type, data) {
			creations++;
			assert.equal(type, "Token");
			assert.equal(data[0].actorId, "summon");
			assert.ok(data.length >= 1 && data.length <= 2);
			return data;
		} };
	globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" }, get: () => ({ active: true }) },
		scenes: new Map([["scene", scene]]), settings: { get: () => true },
		socket: { on: (channel, handler) => { listener = handler; }, emit: (channel, data) => { sent = data; } } };
	globalThis.fromUuid = async uuid => uuid === "power" ? item : actor;
	const request = { type: "summonRequest", requestId: "session", userId: "player", gmId: "gm",
		itemUuid: "power", sceneId: "scene", sourceId: "caster", casterId: "caster", x: 100, y: 100 };
	owned = false;
	await assert.rejects(createSummonForUser(request), /not owned/);
	assert.equal(creations, 0);
	owned = true;
	await assert.rejects(createSummonForUser({ ...request, x: 1000 }), /footprint/);
	await assert.rejects(createSummonForUser({ ...request, cells: [] }), /maximum/);
	await assert.rejects(createSummonForUser({ ...request, cells: [{ x: 100, y: 100 }, { x: 100, y: 100 }] }), /maximum/);
	await assert.rejects(createSummonForUser({ ...request, cells: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }] }), /maximum/);
	await assert.rejects(createSummonForUser({ ...request, cells: [{ x: 100, y: 100 }, { x: 1000, y: 100 }] }), /footprint/);
	assert.equal(creations, 0);
	await createSummonForUser({ ...request, cells: [{ x: 100, y: 100 }, { x: 200, y: 100 }] });
	assert.equal(creations, 1);
	creations = 0;
	registerSummonSocket();
	await Promise.all([listener(request), listener(request)]);
	assert.equal(creations, 1);
	assert.equal(sent.error, null);
	delete globalThis.game;
	delete globalThis.fromUuid;
});
