import test from "node:test";
import assert from "node:assert/strict";
import { CombatTriggerDispatcher } from "../scripts/modules/trigger-prompts/combat-trigger-dispatcher.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";

test("CombatTriggerDispatcher delivers an eligible configured power after an enemy hit", async () => {
  const promptCards = [];
  const enemyToken = { id: "enemy-token", parent: { id: "scene" }, disposition: -1, x: 0, y: 0, width: 1, height: 1 };
  const reaction = { id: "retaliate", type: "power" };
  const heroActor = {
    id: "hero", items: new Map([[reaction.id, reaction]]),
    getFlag: () => ({ assignments: [{ id: "assignment", itemId: reaction.id, triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] }),
    testUserPermission: () => true,
  };
  const heroToken = { id: "hero-token", parent: { id: "scene" }, actor: heroActor, disposition: 1, x: 100, y: 0, width: 1, height: 1 };
  const combatants = [
    { sceneId: "scene", tokenId: enemyToken.id, actor: { id: "enemy" } },
    { sceneId: "scene", tokenId: heroToken.id, actor: heroActor },
  ];
  globalThis.canvas = { grid: { size: 100 } };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: [{ id: "gm", active: true, isGM: true }], combat: { started: true, combatants },
    scenes: new Map([["scene", { tokens: new Map([[enemyToken.id, enemyToken], [heroToken.id, heroToken]]) }]]),
  };
  const dispatcher = new CombatTriggerDispatcher({ createPromptCard: async card => promptCards.push(card) });

  await dispatcher.evaluateCapturedAttack({
    sceneId: "scene", attackerTokenId: enemyToken.id, total: 22, natural: 12,
    targets: [{ sceneId: "scene", tokenId: heroToken.id, defense: 20, defenseType: "ac", missed: false }],
  });

  assert.equal(promptCards.length, 1);
  assert.equal(promptCards[0].trigger.id, TRIGGER_ID.ENEMY_HITS_YOU);
  assert.equal(promptCards[0].actor, heroActor);
  assert.deepEqual(promptCards[0].assignments.map(assignment => assignment.itemId), [reaction.id]);
  assert.deepEqual(promptCards[0].recipientIds, ["gm"]);
});
