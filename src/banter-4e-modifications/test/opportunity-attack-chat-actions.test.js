import test from "node:test";
import assert from "node:assert/strict";
import { OpportunityAttackChatActions } from "../scripts/modules/opportunity-attack-chat/opportunity-attack-chat-actions.js";

test("Opportunity Attack chat actions identify DnD4e variants and NPC Basic Attacks", () => {
  const player = { type: "Player Character" };
  const npc = { type: "NPC" };
  const nativeVariant = { type: "power", system: { attack: { canOpp: true } } };
  const importedVariant = { type: "power", system: { attack: {}, rollModes: { opportunity: { opportunityAttack: true } } } };
  const npcBasicAttack = { type: "power", system: { attack: { isBasic: true } } };
  const ordinaryPower = { type: "power", system: { attack: { canOpp: false, isBasic: false }, rollModes: [{ opportunityAttack: false }] } };

  assert.equal(OpportunityAttackChatActions.isEligiblePower(player, nativeVariant), true);
  assert.equal(OpportunityAttackChatActions.isEligiblePower(player, importedVariant), true);
  assert.equal(OpportunityAttackChatActions.isEligiblePower(npc, npcBasicAttack), true);
  assert.equal(OpportunityAttackChatActions.isEligiblePower(player, ordinaryPower), false);
});

test("chat-card variants cycle from regular to Charge to Opportunity Attack to regular", () => {
  const actor = { type: "Player Character" };
  const power = { type: "power", system: { attack: { canCharge: true, canOpp: true } } };

  assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: {} }, actor, power), "charge");
  assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: { dnd4e: { variance: { isCharge: true } } } }, actor, power), "opportunity");
  assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: { dnd4e: { variance: { isOpp: true } } } }, actor, power), "regular");
  assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: {} }, actor, { type: "power", system: { attack: { canOpp: true } } }), "opportunity");
});

test("switching a chat-card variant uses DnD4e variance before deleting the source message", async () => {
  const calls = [];
  const actor = {
    type: "Player Character",
    usePower: async (item, options) => calls.push({ item, options }),
  };
  const item = { type: "power", system: { attack: { canOpp: true } } };
  const message = {
    isAuthor: true,
    delete: async () => calls.push({ deleted: true }),
  };

  const rolled = await OpportunityAttackChatActions.rollChatCardVariant(message, actor, item, "opportunity", { isGM: false });

  assert.equal(rolled, true);
  assert.deepEqual(calls, [
    { item, options: { configureDialog: true, variance: { isOpp: true } } },
    { deleted: true },
  ]);
});

test("Opportunity Attack chat actions keep DnD4e message-roll authority", () => {
  assert.equal(OpportunityAttackChatActions.canUsePowerFromMessage({ isAuthor: true }, { isGM: false }), true);
  assert.equal(OpportunityAttackChatActions.canUsePowerFromMessage({ isAuthor: false }, { isGM: true }), true);
  assert.equal(OpportunityAttackChatActions.canUsePowerFromMessage({ isAuthor: false }, { isGM: false }), false);
});
