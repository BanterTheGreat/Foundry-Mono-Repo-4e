import test from "node:test";
import assert from "node:assert/strict";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";

test("SocketHelper waits for every defender, then rolls each hit damage group only once", async () => {
  const damageCalls = [];
  const targets = [
    { id: "hero-0", actorId: "hero", tokenId: "hero-token", sceneId: "scene", defenseStat: "AC", resolved: false },
    { id: "hero-1", actorId: "hero", tokenId: "hero-token-2", sceneId: "scene", defenseStat: "AC", resolved: false },
  ];
  const defense = { attackerId: "wolf", itemId: "bite", itemName: "Bite", hasDamage: true, hasMissDamage: false, damageRolled: { normal: false, critical: false, miss: false }, targets };
  const message = {
    id: "defense", content: targets.map(target => `<span data-player-defense-result="${target.id}"><em>Awaiting defense...</em></span>`).join(""), flags: { playerDefense: defense },
    async update(update) { this.content = update.content; this.flags = update.flags; },
  };
  const item = { id: "bite", name: "Bite", rollDamage: async options => damageCalls.push(options) };
  globalThis.game = {
    messages: new Map([[message.id, message]]), actors: new Map([["wolf", { id: "wolf", items: new Map([[item.id, item]]) }]]), settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { handleActiveDefenseOutcome: async () => {} }, SocketHelper: new SocketHelper(),
  };

  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-0", "normal", "normal"), true);
  assert.deepEqual(damageCalls, []);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-1", "critical", "critical"), true);
  assert.deepEqual(damageCalls, [{ fastForward: true }, undefined]);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-1", "critical", "again"), false);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "missing", "normal", "ignored"), false);
});
