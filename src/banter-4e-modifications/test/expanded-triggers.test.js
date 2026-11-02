import test from "node:test";
import assert from "node:assert/strict";
import { TRIGGER_ID as ID } from "../scripts/modules/trigger-prompts/constants.js";
import { findTriggerById, TRIGGERS } from "../scripts/modules/trigger-prompts/trigger-definitions.js";
import { evaluateTriggerDefinition } from "../scripts/modules/trigger-prompts/trigger-evaluator.js";
import { createAttackResolvedEvent, createAttackTargetedEvents, createHpChangedEvent, createSaveResolvedEvent } from "../scripts/modules/trigger-prompts/combat-events.js";
import { confirmedAutomationEvents } from "../scripts/modules/trigger-prompts/automation-events.js";
import { matchesTriggerFilters, attackTypeOf } from "../scripts/modules/trigger-prompts/trigger-filters.js";
import { SpatialService } from "../scripts/modules/trigger-prompts/spatial-service.js";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";
import { suggestTriggersFromText } from "../scripts/modules/trigger-prompts/trigger-text-suggestions.js";

const tokens = ["hero", "enemy", "ally", "spirit"].map((id, index) => ({ id, name: id, disposition: index === 1 ? -1 : 1, actor: { id, uuid: `Actor.${id}` } }));
const [hero, enemy, ally, spirit] = tokens;
const ref = token => ({ sceneId: "scene", tokenId: token.id });
const services = {
  resolveToken: reference => tokens.find(token => token.id === reference?.tokenId),
  combatantTokens: () => [hero, enemy, ally], markOwner: () => hero,
  areHostile: (a, b) => a.disposition !== b.disposition,
  areAllied: (a, b) => a.disposition === b.disposition,
  distanceSquares: (a, b) => a === b ? 0 : 1,
};
const evaluate = (id, event) => evaluateTriggerDefinition(findTriggerById(id), event, services);
const attack = (extra = {}) => createAttackResolvedEvent({ attacker: ref(hero), target: ref(enemy), outcome: "hit", ...extra });

test("opportunity hits require the actual mode, a hit and a hostile target", () => {
  assert.equal(evaluate(ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK, attack({ isOpportunity: true })).length, 1);
  for (const extra of [{}, { isOpportunity: true, outcome: "miss" }, { isOpportunity: true, target: ref(ally) }]) {
    assert.equal(evaluate(ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK, attack(extra)).length, 0);
  }
});

test("marked multi-target attacks exclude the marker anywhere in the full roster and prompt only once", () => {
  const events = targets => createAttackTargetedEvents({ sceneId: "scene", attackerTokenId: "enemy", targets: targets.map(token => ({ ...ref(token), defenseType: "ac" })) });
  assert.equal(events([ally, spirit]).flatMap(event => evaluate(ID.MARKED_ENEMY_ATTACKS_OTHER, event)).length, 1);
  assert.equal(events([ally, hero]).flatMap(event => evaluate(ID.MARKED_ENEMY_ATTACKS_OTHER, event)).length, 0);
});

test("entry distance includes destination, movement inside range and pass-through but excludes the origin alone", () => {
  const spatial = new SpatialService(100);
  const mover = { width: 1, height: 1 };
  const observer = { x: 0, y: 0, width: 1, height: 1 };
  const path = (...xs) => xs.map(x => ({ x, y: 0 }));
  assert.equal(spatial.doesPathEnterRange(path(400, 200), mover, observer, 2), true);
  assert.equal(spatial.doesPathEnterRange(path(200, 100), mover, observer, 2), true);
  assert.equal(spatial.doesPathEnterRange(path(-400, 400), mover, observer, 2), true);
  assert.equal(spatial.doesPathEnterRange(path(200, 300), mover, observer, 2), false);
  assert.equal(spatial.doesPathEnterRange(path(300, 400), mover, observer, 2), false);
  assert.equal(spatial.doesPathEnterRange(path(300, 300), mover, observer, 2), false);
  assert.equal(spatial.doesPathEnterRange(path(400, 300), { width: 2, height: 2 }, { x: 600, y: 0 }, 2), true);
});

test("damage requires positive loss and filters require recorded matching types", () => {
  const event = createHpChangedEvent({ ...ref(hero), oldHp: 40, newHp: 35, damageTypes: ["cold", "fire"] });
  const [context] = evaluate(ID.YOU_TAKE_DAMAGE, event);
  assert.equal(matchesTriggerFilters({ damageTypes: ["acid", "fire"] }, context), true);
  assert.equal(matchesTriggerFilters({ damageTypes: ["poison"] }, context), false);
  assert.equal(matchesTriggerFilters({ damageTypes: ["fire"] }, { ...context, damageTypes: [] }), false);
  assert.equal(evaluate(ID.YOU_TAKE_DAMAGE, { ...event, damageTaken: 0 }).length, 0);
  assert.equal(evaluate(ID.YOU_TAKE_DAMAGE, { ...event, oldHp: 40, newHp: 40, damageTaken: 5 }).length, 1);
});

test("save completion includes success; allied failure excludes enemies", () => {
  const save = outcome => createSaveResolvedEvent({ ...ref(hero), outcome });
  for (const outcome of ["fail", "success"]) {
    assert.equal(evaluate(ID.YOU_MAKE_SAVING_THROW, save(outcome)).length, 1);
  }
  assert.deepEqual(evaluate(ID.YOU_OR_ALLY_FAILS_SAVE, save("fail")).map(c => c.actor.id), ["hero", "ally"]);
  assert.equal(evaluate(ID.YOU_OR_ALLY_FAILS_SAVE, save("success")).length, 0);
});

test("ranged AC/Reflex hits and common filters reject other types, defenses and unknown metadata", () => {
  for (const defense of ["ac", "ref", "fort", "wil"]) {
    for (const range of ["range", "weapon", "closeBurst", "areaBurst"]) {
      const event = attack({ attacker: ref(enemy), target: ref(hero), defenseType: defense, attackRange: range });
      assert.equal(evaluate(ID.RANGED_AC_REFLEX_HITS_YOU, event).length, range === "range" && ["ac", "ref"].includes(defense) ? 1 : 0);
    }
  }
  assert.equal(attackTypeOf("closeBlast"), "close");
  assert.equal(attackTypeOf("areaBurst"), "area");
  assert.equal(matchesTriggerFilters({ attackTypes: ["ranged"], defenseTypes: ["ac", "ref"] }, { attackType: "ranged", defenseType: "ref" }), true);
  assert.equal(matchesTriggerFilters({ attackTypes: ["ranged"] }, {}), false);
});

test("companion prompts require an explicit matching companion and preserve the owner's filter", () => {
  for (const id of [ID.COMPANION_HIT, ID.COMPANION_TARGETED]) {
    const definition = findTriggerById(id);
    const event = { ...attack({ attacker: ref(enemy), target: ref(spirit), attackRange: "weapon" }), type: definition.on };
    const context = evaluate(id, event).find(c => c.actor.id === "hero");
    assert.equal(matchesTriggerFilters({ companionActorUuid: "Actor.spirit", attackTypes: ["melee"] }, context), true);
    assert.equal(matchesTriggerFilters({ companionActorUuid: "Actor.ally" }, context), false);
    assert.equal(matchesTriggerFilters({}, context), false);
    assert.equal(matchesTriggerFilters({ companionActorUuid: "Actor.spirit", attackTypes: ["ranged"] }, context), false);
  }
});

test("confirmed automation converts native and Player Defense verdicts, excludes pending and removed targets", () => {
  const message = { id: "msg", flags: { "dnd4e-health-display": { attackResults: {
    sessionId: "session", sceneId: "scene", casterId: "enemy", targetIds: ["hero", "ally"], pending: true,
    triggerMetadata: { attackRange: "range", defenseType: "ac", isOpportunity: true },
  } }, playerDefense: { automationManaged: true, targets: [{ tokenId: "ally", resolved: true, outcome: "normal" }] } },
  rolls: [{ options: { multirollData: { targetID: "hero", hitstate: "miss", critstate: "" } } }, { options: { multirollData: { targetID: "spirit", hitstate: "hit" } } }] };
  assert.deepEqual(confirmedAutomationEvents(message), []);
  message.flags["dnd4e-health-display"].attackResults.pending = false;
  const events = confirmedAutomationEvents(message);
  assert.deepEqual(events.map(event => [event.target.tokenId, event.outcome, event.isOpportunity, event.attackType]), [["hero", "miss", true, "ranged"], ["ally", "hit", true, "ranged"]]);
  assert.equal(evaluate(ID.ENEMY_MISSES_YOU, events[0]).length, 1);
  assert.equal(evaluate(ID.RANGED_AC_REFLEX_HITS_YOU, events[1]).length, 1);
});

test("every attack-result trigger evaluates the same normalized native and automation event", () => {
  const message = { id: "msg", flags: { "dnd4e-health-display": { attackResults: { sessionId: "s", pending: false, sceneId: "scene", casterId: "enemy", targetIds: ["hero"], triggerMetadata: { attackRange: "weapon", defenseType: "ac", isOpportunity: true } } } }, rolls: [{ options: { multirollData: { targetID: "hero", hitstate: "hit" } } }] };
  const [automated] = confirmedAutomationEvents(message);
  const native = attack({ attacker: ref(enemy), target: ref(hero), attackRange: "weapon", defenseType: "ac", isOpportunity: true });
  for (const definition of TRIGGERS.filter(t => t.on === "attack-resolved")) {
    assert.deepEqual(evaluateTriggerDefinition(definition, automated, services), evaluateTriggerDefinition(definition, native, services), definition.id);
  }
});

test("dialog round-trips validated filters, range and companion binding", () => {
  const data = new FormData();
  const id = ID.COMPANION_HIT;
  for (const [key, value] of [["enabled", "on"], ["attackTypes", "melee"], ["attackTypes", "invalid"], ["defenseTypes", "ref"], ["companionActorUuid", "Actor.spirit"]]) {
    data.append(`${id}.${key}`, value);
  }
  assert.deepEqual(PowerTriggerDialog.readAssignments(data)[0].parameters, { attackTypes: ["melee"], defenseTypes: ["ref"], companionActorUuid: "Actor.spirit" });
  assert.deepEqual(suggestTriggersFromText("You take acid, cold, fire, or lightning damage.")[0].parameters.damageTypes, ["acid", "cold", "fire", "lightning"]);
  assert.equal(suggestTriggersFromText("An enemy enters a square within 2 squares of you")[0].parameters.rangeSquares, 2);
});
