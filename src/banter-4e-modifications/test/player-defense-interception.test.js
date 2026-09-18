import test from "node:test";
import assert from "node:assert/strict";
import { PlayerDefense } from "../scripts/modules/player-defense/player-defense.js";

test("Player Defense replaces a captured NPC attack with a defense card", () => {
  const createdMessages = [];
  const attacker = { id: "badger", name: "Badger", type: "NPC" };
  const defender = { id: "rogal", name: "Rogal", type: "Player Character", effects: [] };
  const targetToken = { id: "rogal-token", actor: defender, document: { parent: { id: "scene" } } };
  let clearedCaptures = 0;

  globalThis.canvas = { scene: { id: "scene" } };
  globalThis.ChatMessage = { create: data => createdMessages.push(data) };
  globalThis.game = {
    actors: [attacker],
    combat: { combatants: [{ actorId: attacker.id, tokenId: "badger-token", sceneId: "scene" }] },
    users: [{ id: "gm", active: true, isGM: true }],
    settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { clearPendingAttackContext: () => { clearedCaptures += 1; } },
    PlayerDefense: new PlayerDefense(),
  };

  const item = { id: "bite", name: "Bite", rangeType: "weapon", system: { attack: { def: "ac" }, hit: {}, miss: {} }, hasDamage: false };
  PlayerDefense.OnRollAttack(item, { targets: [targetToken], targDefValArray: [26] }, { actor: attacker.id, token: "badger-token" });
  const intercepted = PlayerDefense.OnPowerChatMessage({ flavor: "Attack: Bite", rolls: [{ formula: "1d20 + 16" }] });

  assert.equal(intercepted, false);
  assert.equal(clearedCaptures, 1);
  assert.equal(createdMessages.length, 1);
  assert.equal(createdMessages[0].flags.playerDefense.attackName, "Bite");
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].defenseMod, 16);
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].rollDC, 28);
  assert.equal(createdMessages[0].flags.playerDefense.attackRange, "weapon");
  assert.match(createdMessages[0].content, /Rogal \(\+16\) defends/);
});
