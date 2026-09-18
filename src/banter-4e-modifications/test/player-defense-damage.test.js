import test from "node:test";
import assert from "node:assert/strict";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";

test("a resolved normal defense hit rolls the attacking power's damage once", async () => {
  const damageCalls = [];
  const activeDefenseOutcomes = [];
  const target = { id: "rogal-0", actorId: "rogal", tokenId: "rogal-token", sceneId: "scene", defenseStat: "AC", resolved: false };
  const defense = {
    attackerId: "badger",
    attackerTokenId: "badger-token",
    sceneId: "scene",
    itemId: "bite",
    itemName: "Bite",
    attackRange: "weapon",
    hasDamage: true,
    hasMissDamage: false,
    damageRolled: { normal: false, critical: false, miss: false },
    targets: [target],
  };
  const message = {
    id: "defense-message",
    content: '<span data-player-defense-result="rogal-0"><em>Awaiting defense...</em></span>',
    flags: { playerDefense: defense },
    async update(update) {
      this.content = update.content;
      this.flags = update.flags;
    },
  };
  const power = { id: "bite", name: "Bite", rollDamage: async options => damageCalls.push(options) };
  const attacker = { id: "badger", items: new Map([[power.id, power]]) };

  globalThis.game = {
    messages: new Map([[message.id, message]]),
    actors: new Map([[attacker.id, attacker]]),
    settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { handleActiveDefenseOutcome: async (context, outcome) => activeDefenseOutcomes.push({ context, outcome }) },
    SocketHelper: new SocketHelper(),
  };

  const resolved = await SocketHelper.resolveDefenseTarget(message.id, target.id, "normal", "<b>HIT</b>");

  assert.equal(resolved, true);
  assert.equal(target.resolved, true);
  assert.deepEqual(damageCalls, [{ fastForward: true }]);
  assert.deepEqual(activeDefenseOutcomes, [{
    context: {
      attackerActorId: "badger", attackerTokenId: "badger-token", sceneId: "scene", targetActorId: "rogal", targetTokenId: "rogal-token", targetSceneId: "scene", defenseType: "AC", attackRange: "weapon",
    },
    outcome: "hit",
  }]);
});
