import test from "node:test";
import assert from "node:assert/strict";
import { ActorTriggerConfiguration } from "../scripts/modules/trigger-prompts/actor-trigger-configuration.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { findTriggerById } from "../scripts/modules/trigger-prompts/trigger-registry.js";

test("Trigger configuration omits exhausted powers while retaining other available powers", () => {
  const exhausted = { id: "spent", type: "power", preparedMaxUses: 1, system: { uses: { per: "encounter", value: 0 } } };
  const available = { id: "ready", type: "power", preparedMaxUses: 1, system: { uses: { per: "encounter", value: 1 } } };
  const actor = {
    items: new Map([[exhausted.id, exhausted], [available.id, available]]),
    getFlag: () => ({ assignments: [
      { id: "spent-assignment", itemId: exhausted.id, triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} },
      { id: "ready-assignment", itemId: available.id, triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} },
    ] }),
  };

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(actor, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), [available.id]);
});

test("Trigger configuration produces no choices when every assigned power is exhausted", () => {
  const exhausted = { id: "spent", type: "power", preparedMaxUses: 1, system: { uses: { per: "daily", value: 0 } } };
  const actor = {
    items: new Map([[exhausted.id, exhausted]]),
    getFlag: () => ({ assignments: [{ id: "spent-assignment", itemId: exhausted.id, triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] }),
  };

  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(actor, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU)), []);
});

test("Trigger configuration retains an unbounded power whose legacy use value is zero", () => {
  const available = { id: "encounter", type: "power", preparedMaxUses: 0, system: { uses: { per: "encounter", value: 0 } } };
  const actor = {
    items: new Map([[available.id, available]]),
    getFlag: () => ({ assignments: [{ id: "assignment", itemId: available.id, triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] }),
  };

  assert.deepEqual(
    ActorTriggerConfiguration.eligibleAssignmentsFor(actor, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU)).map(assignment => assignment.itemId),
    [available.id],
  );
});

test("Opportunity attack prompts include explicitly marked and variant-mode powers only", () => {
  const explicitOpportunityAttack = { id: "explicit", type: "power", system: { attack: { isOpp: true } } };
  const nativeVariantOpportunityAttack = { id: "native-variant", type: "power", system: { attack: { isOpp: false, canOpp: true } } };
  const variantOpportunityAttack = { id: "variant", type: "power", system: { attack: { isOpp: false }, rollModes: [{ opportunityAttack: true }] } };
  const nonOpportunityPower = { id: "ordinary", type: "power", system: { attack: { isOpp: false, canOpp: false }, rollModes: [{ opportunityAttack: false }] } };
  const actor = {
    type: "PC",
    items: [explicitOpportunityAttack, nativeVariantOpportunityAttack, variantOpportunityAttack, nonOpportunityPower],
    getFlag: () => ({ assignments: [] }),
  };

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(actor, findTriggerById(TRIGGER_ID.OPPORTUNITY_ATTACK));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), [explicitOpportunityAttack.id, nativeVariantOpportunityAttack.id, variantOpportunityAttack.id]);
});
