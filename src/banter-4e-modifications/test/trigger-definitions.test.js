import test from "node:test";
import assert from "node:assert/strict";
import {
  createAttackResolvedEvent,
  createHpChangedEvent,
  createMovementCommittedEvent,
  createSaveResolvedEvent,
} from "../scripts/modules/trigger-prompts/combat-events.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { TRIGGERS, findTriggerById, findTriggersForEvent } from "../scripts/modules/trigger-prompts/trigger-definitions.js";
import { evaluateTriggerDefinition } from "../scripts/modules/trigger-prompts/trigger-evaluator.js";

const sceneId = "scene";
const enemy = { id: "enemy", name: "Badger", disposition: -1, actor: { id: "enemy-actor", system: { marker: "Actor.target-actor" } } };
const target = { id: "target", name: "Rogal", disposition: 1, actor: { id: "target-actor", uuid: "Actor.target-actor" } };
const ally = { id: "ally", name: "Ally", disposition: 1, actor: { id: "ally-actor" } };
const tokens = [enemy, target, ally];
const services = {
  resolveToken: reference => reference.sceneId === sceneId ? tokens.find(token => token.id === reference.tokenId) ?? null : null,
  combatantTokens: () => tokens,
  markOwner: marked => marked?.actor?.system?.marker === target.actor.uuid ? target : null,
  areHostile: (left, right) => left.disposition !== right.disposition,
  areAllied: (left, right) => left.disposition === right.disposition,
  distanceSquares: (left, right) => left === right ? 0 : 4,
  doesPathPassAdjacent: () => true,
};

const attack = (outcome, fields = {}) => createAttackResolvedEvent({
  outcome,
  attacker: { sceneId, tokenId: enemy.id },
  target: { sceneId, tokenId: target.id },
  defenseType: "AC",
  ...fields,
});
const evaluate = (triggerId, event, overrides = {}) => evaluateTriggerDefinition(findTriggerById(triggerId), event, { ...services, ...overrides });
const actorIds = prompts => prompts.map(prompt => prompt.actor.id);

test("every definition listens for one known event type and rejects an unrelated event", () => {
  for (const trigger of TRIGGERS) {
    assert.ok(findTriggersForEvent(trigger.on).includes(trigger), trigger.id);
    assert.deepEqual(evaluateTriggerDefinition(trigger, { type: "unrelated" }, services), [], trigger.id);
  }
});

test("definitions reference only known triggers and unique IDs", () => {
  const ids = TRIGGERS.map(trigger => trigger.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), Object.values(TRIGGER_ID).sort());
  for (const trigger of TRIGGERS) {
    for (const superseded of trigger.text?.supersedes ?? []) {
      assert.ok(ids.includes(superseded), `${trigger.id} supersedes unknown ${superseded}`);
    }
  }
});

test("opportunity attack identifies a hostile combatant whose path passes adjacent", () => {
  const event = createMovementCommittedEvent({ sceneId, tokenId: enemy.id, path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });

  const prompts = evaluate(TRIGGER_ID.OPPORTUNITY_ATTACK, event);

  assert.deepEqual(actorIds(prompts), ["target-actor", "ally-actor"]);
  assert.equal(prompts[0].detail, "Badger moved adjacent to Rogal.");
  assert.deepEqual(evaluate(TRIGGER_ID.OPPORTUNITY_ATTACK, event, { doesPathPassAdjacent: () => false }), []);
});

test("opportunity attack ignores the mover and non-hostile combatants", () => {
  const event = createMovementCommittedEvent({ sceneId, tokenId: target.id, path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });

  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.OPPORTUNITY_ATTACK, event)), ["enemy-actor"]);
});

test("enemy miss triggers identify the target and eligible allies", () => {
  const selfPrompts = evaluate(TRIGGER_ID.ENEMY_MISSES_YOU, attack("miss"));
  const allyPrompts = evaluate(TRIGGER_ID.ENEMY_MISSES_ALLY, attack("miss"));

  assert.deepEqual(actorIds(selfPrompts), ["target-actor"]);
  assert.deepEqual(actorIds(allyPrompts), ["target-actor", "ally-actor"]);
  assert.equal(allyPrompts[1].distanceSquares, 4);
  assert.equal(allyPrompts[0].detail, "Badger missed Rogal.");
  assert.deepEqual(evaluate(TRIGGER_ID.ENEMY_MISSES_YOU, attack("hit")), []);
});

test("an attack between allies never prompts a hostility-gated trigger", () => {
  const friendly = attack("miss", { attacker: { sceneId, tokenId: ally.id } });

  assert.deepEqual(evaluate(TRIGGER_ID.ENEMY_MISSES_YOU, friendly), []);
  assert.deepEqual(evaluate(TRIGGER_ID.YOU_MISS, friendly), []);
});

test("enemy hit and you miss triggers identify opposite sides of the same attack", () => {
  const hitPrompts = evaluate(TRIGGER_ID.ENEMY_HITS_YOU, attack("hit"));
  const missPrompts = evaluate(TRIGGER_ID.YOU_MISS, attack("miss"));

  assert.deepEqual(actorIds(hitPrompts), ["target-actor"]);
  assert.equal(hitPrompts[0].distanceSquares, 4);
  assert.deepEqual(actorIds(missPrompts), ["enemy-actor"]);
  assert.equal(missPrompts[0].sourceName, "Rogal");
});

test("AC and Reflex misses qualify while Fortitude misses do not", () => {
  const prompts = evaluate(TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU, attack("miss", { defenseType: "AC" }));

  assert.deepEqual(actorIds(prompts), ["target-actor"]);
  assert.equal(prompts[0].detail, "Badger missed Rogal's AC.");
  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU, attack("miss", { defenseType: "ref" }))), ["target-actor"]);
  assert.deepEqual(evaluate(TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU, attack("miss", { defenseType: "fort" })), []);
});

test("a marked enemy hitting an ally prompts the mark owner, not when the owner is the target", () => {
  const hitAlly = attack("hit", { target: { sceneId, tokenId: ally.id } });

  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY, hitAlly)), ["target-actor"]);
  assert.deepEqual(evaluate(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY, attack("hit")), []);
  assert.deepEqual(evaluate(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY, attack("miss", { target: { sceneId, tokenId: ally.id } })), []);
  assert.deepEqual(evaluate(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY, hitAlly, { markOwner: () => null }), []);
});

test("mark triggers identify the mark owner for a bloodied transition and for movement", () => {
  const bloodied = createHpChangedEvent({ sceneId, tokenId: enemy.id, oldHp: 20, newHp: 8, bloodiedThreshold: 10 });
  const movement = createMovementCommittedEvent({ sceneId, tokenId: enemy.id, path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });

  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.MARKED_CREATURE_BLOODIED, bloodied)), ["target-actor"]);
  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT, movement)), ["target-actor"]);
  assert.deepEqual(evaluate(TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT, movement, { doesPathPassAdjacent: () => false }), []);
});

test("becoming bloodied prompts the affected actor only when the threshold is crossed", () => {
  const crossed = createHpChangedEvent({ sceneId, tokenId: target.id, oldHp: 20, newHp: 10, bloodiedThreshold: 10 });
  const alreadyBloodied = createHpChangedEvent({ sceneId, tokenId: target.id, oldHp: 9, newHp: 4, bloodiedThreshold: 10 });
  const healed = createHpChangedEvent({ sceneId, tokenId: target.id, oldHp: 4, newHp: 18, bloodiedThreshold: 10 });

  const prompts = evaluate(TRIGGER_ID.YOU_BECOME_BLOODIED, crossed);

  assert.deepEqual(actorIds(prompts), ["target-actor"]);
  assert.match(prompts[0].detail, /Rogal.*became bloodied/i);
  assert.deepEqual(evaluate(TRIGGER_ID.YOU_BECOME_BLOODIED, alreadyBloodied), []);
  assert.deepEqual(evaluate(TRIGGER_ID.YOU_BECOME_BLOODIED, healed), []);
});

test("a hostile hit with Weapon or Melee X range prompts the target", () => {
  for (const attackRange of ["weapon", "melee", "Melee 1"]) {
    assert.deepEqual(actorIds(evaluate(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK, attack("hit", { attackRange }))), ["target-actor"], attackRange);
  }
  assert.deepEqual(evaluate(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK, attack("hit", { attackRange: "Ranged 10" })), []);
  assert.deepEqual(evaluate(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK, attack("miss", { attackRange: "weapon" })), []);
});

test("a failed saving throw prompts the saving actor", () => {
  const failed = createSaveResolvedEvent({ sceneId, tokenId: target.id, actorId: target.actor.id, outcome: "fail" });
  const succeeded = createSaveResolvedEvent({ sceneId, tokenId: target.id, actorId: target.actor.id, outcome: "success" });

  assert.deepEqual(actorIds(evaluate(TRIGGER_ID.FAILS_SAVING_THROW, failed)), ["target-actor"]);
  assert.deepEqual(evaluate(TRIGGER_ID.FAILS_SAVING_THROW, succeeded), []);
});

test("an event naming a token that is not a combatant produces no prompt", () => {
  const stranger = attack("miss", { attacker: { sceneId, tokenId: "not-in-combat" } });

  assert.deepEqual(evaluate(TRIGGER_ID.ENEMY_MISSES_YOU, stranger), []);
});

test("a recipient with no actor is skipped", () => {
  const actorless = { ...target, actor: null };

  const prompts = evaluate(TRIGGER_ID.ENEMY_MISSES_YOU, attack("miss"), { resolveToken: reference => reference.tokenId === target.id ? actorless : services.resolveToken(reference) });

  assert.deepEqual(prompts, []);
});

test("the movement type recorded on an event does not change evaluation", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const walked = evaluate(TRIGGER_ID.OPPORTUNITY_ATTACK, createMovementCommittedEvent({ sceneId, tokenId: enemy.id, path, movementType: "walk" }));
  const forced = evaluate(TRIGGER_ID.OPPORTUNITY_ATTACK, createMovementCommittedEvent({ sceneId, tokenId: enemy.id, path, movementType: "forced" }));

  assert.deepEqual(actorIds(forced), actorIds(walked));
});
