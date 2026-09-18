import test from "node:test";
import assert from "node:assert/strict";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { TRIGGERS } from "../scripts/modules/trigger-prompts/trigger-registry.js";

const sceneId = "scene";
const enemy = { id: "enemy", name: "Badger", disposition: -1, actor: { id: "enemy-actor" } };
const target = { id: "target", name: "Rogal", disposition: 1, actor: { id: "target-actor" } };
const ally = { id: "ally", name: "Ally", disposition: 1, actor: { id: "ally-actor" } };
const tokens = new Map([[enemy.id, enemy], [target.id, target], [ally.id, ally]]);
const combatants = [enemy, target, ally].map(token => ({ id: `combatant-${token.id}`, sceneId, tokenId: token.id }));
const services = {
  combatants,
  getToken: (candidateSceneId, tokenId) => candidateSceneId === sceneId ? tokens.get(tokenId) : null,
  markOwner: marked => marked === enemy ? target : null,
  areHostile: (left, right) => left.disposition !== right.disposition,
  areAllies: (left, right) => left.disposition === right.disposition,
  distanceSquares: (left, right) => left === right ? 0 : 4,
  movesAdjacent: () => true,
};

const attackEvent = (outcome, defenseType = "ac") => ({
  type: TRIGGER_EVENT_TYPE.ATTACK_RESULT,
  outcome,
  defenseType,
  attacker: { sceneId, tokenId: enemy.id },
  target: { sceneId, tokenId: target.id },
});

const markedHitAllyEvent = {
  type: TRIGGER_EVENT_TYPE.ATTACK_RESULT,
  outcome: "hit",
  attacker: { sceneId, tokenId: enemy.id },
  target: { sceneId, tokenId: ally.id },
};

const triggerById = id => TRIGGERS.find(trigger => trigger.id === id);

test("every registered trigger rejects an unrelated event", () => {
  for (const trigger of TRIGGERS) {
    assert.deepEqual(trigger.evaluate({ type: "unrelated" }, services), [], trigger.id);
  }
});

test("opportunity attack identifies a hostile combatant encountered during movement", () => {
  const prompts = triggerById(TRIGGER_ID.OPPORTUNITY_ATTACK).evaluate({
    type: TRIGGER_EVENT_TYPE.MOVEMENT,
    combatant: combatants[0],
    sceneId,
    tokenId: enemy.id,
    destination: { x: 1, y: 1 },
  }, services);

  assert.deepEqual(prompts.map(prompt => prompt.actor.id), ["target-actor", "ally-actor"]);
});

test("enemy miss triggers identify the target and eligible allies", () => {
  const selfPrompts = triggerById(TRIGGER_ID.ENEMY_MISSES_YOU).evaluate(attackEvent("miss"), services);
  const allyPrompts = triggerById(TRIGGER_ID.ENEMY_MISSES_ALLY).evaluate(attackEvent("miss"), services);

  assert.deepEqual(selfPrompts.map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(allyPrompts.map(prompt => prompt.actor.id), ["target-actor", "ally-actor"]);
  assert.equal(allyPrompts[1].distanceSquares, 4);
});

test("enemy hit and you miss triggers identify opposite sides of the same attack", () => {
  const hitPrompts = triggerById(TRIGGER_ID.ENEMY_HITS_YOU).evaluate(attackEvent("hit"), services);
  const missPrompts = triggerById(TRIGGER_ID.YOU_MISS).evaluate(attackEvent("miss"), services);

  assert.deepEqual(hitPrompts.map(prompt => prompt.actor.id), ["target-actor"]);
  assert.equal(hitPrompts[0].distanceSquares, 4);
  assert.deepEqual(missPrompts.map(prompt => prompt.actor.id), ["enemy-actor"]);
});

test("AC and Reflex misses qualify while Fortitude misses do not", () => {
  const trigger = triggerById(TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU);

  assert.deepEqual(trigger.evaluate(attackEvent("miss", "ac"), services).map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(trigger.evaluate(attackEvent("miss", "ref"), services).map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(trigger.evaluate(attackEvent("miss", "fort"), services), []);
});

test("mark triggers identify the mark owner for a hit, bloodied transition, and movement", () => {
  const hitPrompts = triggerById(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY).evaluate(markedHitAllyEvent, services);
  const bloodiedPrompts = triggerById(TRIGGER_ID.MARKED_CREATURE_BLOODIED).evaluate({ type: TRIGGER_EVENT_TYPE.BLOODIED, sceneId, tokenId: enemy.id }, services);
  const movementPrompts = triggerById(TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT).evaluate({ type: TRIGGER_EVENT_TYPE.MOVEMENT, sceneId, tokenId: enemy.id, destination: { x: 1, y: 1 } }, services);

  assert.deepEqual(hitPrompts.map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(bloodiedPrompts.map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(movementPrompts.map(prompt => prompt.actor.id), ["target-actor"]);
});

test("becoming bloodied prompts the affected actor", () => {
  const prompts = triggerById(TRIGGER_ID.YOU_BECOME_BLOODIED).evaluate({
    type: TRIGGER_EVENT_TYPE.BLOODIED,
    sceneId,
    tokenId: target.id,
  }, services);

  assert.deepEqual(prompts.map(prompt => prompt.actor.id), ["target-actor"]);
  assert.match(prompts[0].detail, /Rogal.*became bloodied/i);
});

test("a hostile hit with Weapon or Melee X range prompts the target", () => {
  const trigger = triggerById(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK);

  for (const attackRange of ["weapon", "melee", "Melee 1"]) {
    assert.deepEqual(trigger.evaluate({ ...attackEvent("hit"), attackRange }, services).map(prompt => prompt.actor.id), ["target-actor"]);
  }
  assert.deepEqual(trigger.evaluate({ ...attackEvent("hit"), attackRange: "Ranged 10" }, services), []);
});

test("a failed saving throw prompts the saving actor", () => {
  const trigger = triggerById(TRIGGER_ID.FAILS_SAVING_THROW);
  const savingThrow = { type: TRIGGER_EVENT_TYPE.SAVING_THROW_RESULT, outcome: "fail", actor: { actorId: target.actor.id, sceneId, tokenId: target.id } };
  const savingThrowServices = { ...services, findCombatant: actor => actor.tokenId === target.id ? { actor: target.actor, name: target.name } : null };

  assert.deepEqual(trigger.evaluate(savingThrow, savingThrowServices).map(prompt => prompt.actor.id), ["target-actor"]);
  assert.deepEqual(trigger.evaluate({ ...savingThrow, outcome: "success" }, savingThrowServices), []);
});
