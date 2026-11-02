import test from "node:test";
import assert from "node:assert/strict";
import { ActorTriggerConfiguration } from "../scripts/modules/trigger-prompts/actor-trigger-configuration.js";
import { ItemTriggerAssignments } from "../scripts/modules/trigger-prompts/item-trigger-assignments.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { findTriggerById } from "../scripts/modules/trigger-prompts/trigger-definitions.js";

const MODULE = "banter-4e-modifications";
const FLAG = "trigger-prompts";

/** A power with item-flag assignments; `assignments` undefined means never configured. */
function power(id, assignments, extra = {}) {
  const item = {
    id, type: "power", name: id, system: {}, ...extra,
    flags: assignments ? { [MODULE]: { [FLAG]: { version: 1, assignments } } } : {},
    async setFlag(scope, key, value) { this.flags = { [scope]: { [key]: value } }; },
  };
  return item;
}
const assign = (triggerId, parameters = {}, source = "manual") => ({ triggerId, parameters, source });

test("Combat Challenge is actor scoped, off by default, and preserved by migration", async () => {
  assert.equal(ActorTriggerConfiguration.isCombatChallengeEnabled(actor([])), false);
  const strike = power("strike");
  const hero = actor([strike], { classFeatures: { combatChallenge: true }, assignments: [
    { itemId: "strike", triggerId: TRIGGER_ID.YOU_MISS, parameters: {} },
  ] });
  await ActorTriggerConfiguration.migrateLegacyAssignments(hero);
  assert.equal(ActorTriggerConfiguration.isCombatChallengeEnabled(hero), true);
  assert.equal(ActorTriggerConfiguration.isCombatChallengeEnabled(actor([])), false);
});

test("non-minion, melee and adjacency restrictions must all be satisfied", () => {
  const restrictions = { nonMinion: true, meleeOnly: true, adjacentOnly: true };
  const feat = power("restricted", [assign(TRIGGER_ID.YOU_BLOODY_ENEMY, restrictions)], { type: "feature" });
  const hero = actor([feat]);
  const trigger = findTriggerById(TRIGGER_ID.YOU_BLOODY_ENEMY);
  const eligible = { isMinion: false, isMelee: true, adjacent: true };
  assert.equal(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, trigger, eligible).length, 1);
  for (const context of [{ ...eligible, isMinion: true }, { ...eligible, isMelee: false }, { ...eligible, adjacent: false }, {}]) {
    assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, trigger, context), []);
  }
});

test("feats retain item assignments and are offered for defeat triggers", async () => {
  const feat = power("feat", undefined, { type: "feature" });
  await ItemTriggerAssignments.write(feat, [assign(TRIGGER_ID.YOU_REDUCE_ENEMY_TO_ZERO)]);
  const hero = actor([feat]);
  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.YOU_REDUCE_ENEMY_TO_ZERO)).map(entry => entry.itemId), [feat.id]);
  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ADJACENT_ENEMY_REDUCED_TO_ZERO)), []);
});

/** An actor with an optional actor-flag; its items are a Map, like a Foundry Collection. */
function actor(items, actorFlag, extra = {}) {
  const stored = { value: actorFlag };
  return {
    type: "PC", items: new Map(items.map(item => [item.id, item])),
    getFlag: () => stored.value,
    async setFlag(scope, key, value) { stored.value = value; },
    stored, ...extra,
  };
}

test("an assignment on a power is offered for its trigger", () => {
  const strike = power("strike", [assign(TRIGGER_ID.ENEMY_HITS_YOU)]);
  const hero = actor([strike, power("other", [assign(TRIGGER_ID.YOU_MISS)])]);

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["strike"]);
  assert.equal(assignments[0].item, strike);
});

test("a power that was never configured offers nothing", () => {
  const hero = actor([power("plain", undefined)]);

  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU)), []);
});

test("assignments for unknown triggers and non-power items are ignored", () => {
  const stale = power("stale", [assign("no-such-trigger"), assign(TRIGGER_ID.ENEMY_HITS_YOU)]);
  const weapon = { ...power("sword", [assign(TRIGGER_ID.ENEMY_HITS_YOU)]), type: "weapon" };
  const hero = actor([stale, weapon]);

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["stale"]);
});

test("a duplicated power keeps its assignments on whichever actor owns it", () => {
  const original = power("original", [assign(TRIGGER_ID.YOU_MISS)]);
  const copy = { ...power("copy", undefined), flags: structuredClone(original.flags) };
  const otherHero = actor([copy]);

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(otherHero, findTriggerById(TRIGGER_ID.YOU_MISS));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["copy"]);
});

test("range limits an assignment using the event's distance", () => {
  const strike = power("strike", [assign(TRIGGER_ID.ENEMY_HITS_YOU, { rangeSquares: 3 })]);
  const hero = actor([strike]);
  const trigger = findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU);

  assert.equal(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, trigger, { distanceSquares: 3 }).length, 1);
  assert.equal(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, trigger, { distanceSquares: 4 }).length, 0);
});

test("Trigger configuration omits exhausted powers while retaining other available powers", () => {
  const exhausted = power("spent", [assign(TRIGGER_ID.ENEMY_HITS_YOU)], { preparedMaxUses: 1, system: { uses: { per: "encounter", value: 0 } } });
  const available = power("ready", [assign(TRIGGER_ID.ENEMY_HITS_YOU)], { preparedMaxUses: 1, system: { uses: { per: "encounter", value: 1 } } });
  const hero = actor([exhausted, available]);

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["ready"]);
});

test("Trigger configuration retains an unbounded power whose legacy use value is zero", () => {
  const unbounded = power("encounter", [assign(TRIGGER_ID.ENEMY_HITS_YOU)], { preparedMaxUses: 0, system: { uses: { per: "encounter", value: 0 } } });

  assert.deepEqual(
    ActorTriggerConfiguration.eligibleAssignmentsFor(actor([unbounded]), findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU)).map(assignment => assignment.itemId),
    ["encounter"],
  );
});

test("Opportunity attack prompts include explicitly marked and variant-mode powers only", () => {
  const explicit = { id: "explicit", type: "power", system: { attack: { isOpp: true } } };
  const nativeVariant = { id: "native-variant", type: "power", system: { attack: { isOpp: false, canOpp: true } } };
  const variant = { id: "variant", type: "power", system: { attack: { isOpp: false }, rollModes: [{ opportunityAttack: true }] } };
  const ordinary = { id: "ordinary", type: "power", system: { attack: { isOpp: false, canOpp: false }, rollModes: [{ opportunityAttack: false }] } };
  const hero = { type: "PC", items: [explicit, nativeVariant, variant, ordinary], getFlag: () => ({ assignments: [] }) };

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.OPPORTUNITY_ATTACK));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["explicit", "native-variant", "variant"]);
});

test("NPC Basic Attacks count as opportunity attacks, and the actor option can switch them off", () => {
  const basic = { id: "basic", type: "power", system: { attack: { isBasic: true } } };
  const npc = { type: "NPC", items: [basic], getFlag: () => ({ assignments: [], opportunityAttack: { enabled: true } }) };
  const disabled = { type: "NPC", items: [basic], getFlag: () => ({ assignments: [], opportunityAttack: { enabled: false } }) };
  const trigger = findTriggerById(TRIGGER_ID.OPPORTUNITY_ATTACK);

  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(npc, trigger).map(assignment => assignment.itemId), ["basic"]);
  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(disabled, trigger), []);
});

test("opportunity prompts default off for NPCs and on for PCs across configuration formats", () => {
  for (const stored of [undefined, {}, { assignments: [] }]) {
    for (const type of ["NPC", "Player Character"]) {
      const creature = { type, getFlag: () => stored };
      assert.equal(ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(creature), type !== "NPC");
    }
  }
  for (const enabled of [true, false]) {
    for (const stored of [
      { assignments: [], opportunityAttack: { enabled } },
      { [TRIGGER_ID.OPPORTUNITY_ATTACK]: { enabled } },
    ]) {
      assert.equal(ActorTriggerConfiguration.isOpportunityAttackPromptEnabled({ type: "NPC", getFlag: () => stored }), enabled);
    }
  }
});

test("an actor-level reminder is on only when the actor enabled it", () => {
  const trigger = findTriggerById(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY);
  const enabled = actor([], { assignments: [], actorLevelTriggers: { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } } });

  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(enabled, trigger), [{}]);
  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(actor([], { assignments: [] }), trigger), []);
});

test("assignments still held in the actor flag apply until the power is saved", () => {
  const strike = power("strike", undefined);
  const hero = actor([strike], { assignments: [{ id: "old", itemId: "strike", triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] });

  const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.deepEqual(assignments.map(assignment => assignment.itemId), ["strike"]);
});

test("once a power is saved its own assignments replace the actor flag's, even when empty", () => {
  const strike = power("strike", []);
  const hero = actor([strike], { assignments: [{ itemId: "strike", triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] });

  assert.deepEqual(ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU)), []);
});

test("the oldest selector-based flag format still resolves to assignments", () => {
  const strike = power("strike", undefined);
  const hero = actor([strike], { [TRIGGER_ID.ENEMY_HITS_YOU]: { enabled: true, itemId: "item:strike", rangeSquares: 6 } });

  const [assignment] = ActorTriggerConfiguration.eligibleAssignmentsFor(hero, findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU));

  assert.equal(assignment.itemId, "strike");
  assert.deepEqual(assignment.parameters, { rangeSquares: 6 });
});

test("migration moves actor-flag assignments onto their powers and clears the flag", async () => {
  const strike = power("strike", undefined);
  const parry = power("parry", undefined);
  const hero = actor([strike, parry], {
    opportunityAttack: { enabled: false },
    actorLevelTriggers: { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } },
    assignments: [
      { id: "a", itemId: "strike", triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: { rangeSquares: 7 } },
      { id: "b", itemId: "strike", triggerId: TRIGGER_ID.YOU_MISS, parameters: {} },
      { id: "c", itemId: "parry", triggerId: TRIGGER_ID.ENEMY_MISSES_YOU, parameters: {} },
      { id: "d", itemId: "deleted-power", triggerId: TRIGGER_ID.YOU_MISS, parameters: {} },
    ],
  });

  const migrated = await ActorTriggerConfiguration.migrateLegacyAssignments(hero);

  assert.equal(migrated, 3);
  assert.deepEqual(ItemTriggerAssignments.read(strike).assignments.map(assignment => [assignment.triggerId, assignment.parameters]), [
    [TRIGGER_ID.ENEMY_HITS_YOU, { rangeSquares: 7 }],
    [TRIGGER_ID.YOU_MISS, {}],
  ]);
  assert.deepEqual(ItemTriggerAssignments.read(parry).assignments.map(assignment => assignment.triggerId), [TRIGGER_ID.ENEMY_MISSES_YOU]);
  assert.deepEqual(hero.stored.value.assignments, []);
  assert.deepEqual(hero.stored.value.opportunityAttack, { enabled: false, oncePerTurn: true });
  assert.deepEqual(hero.stored.value.actorLevelTriggers, { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } });
});

test("migration never overwrites a power the user already saved", async () => {
  const saved = power("strike", [assign(TRIGGER_ID.YOU_MISS)]);
  const hero = actor([saved], { assignments: [{ itemId: "strike", triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: {} }] });

  await ActorTriggerConfiguration.migrateLegacyAssignments(hero);

  assert.deepEqual(ItemTriggerAssignments.read(saved).assignments.map(assignment => assignment.triggerId), [TRIGGER_ID.YOU_MISS]);
  assert.deepEqual(hero.stored.value.assignments, []);
});

test("migration preserves a legacy selector-format actor's disabled opportunity attacks", async () => {
  const strike = power("strike", undefined);
  const hero = actor([strike], {
    [TRIGGER_ID.OPPORTUNITY_ATTACK]: { enabled: false },
    [TRIGGER_ID.ENEMY_HITS_YOU]: { enabled: true, itemId: "strike" },
  });

  await ActorTriggerConfiguration.migrateLegacyAssignments(hero);

  assert.equal(ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(hero), false);
  assert.deepEqual(ItemTriggerAssignments.read(strike).assignments.map(assignment => assignment.triggerId), [TRIGGER_ID.ENEMY_HITS_YOU]);
});

test("migration leaves an actor with nothing to move untouched", async () => {
  const hero = actor([power("strike", [assign(TRIGGER_ID.YOU_MISS)])], { assignments: [] });
  let writes = 0;
  hero.setFlag = async () => { writes += 1; };

  assert.equal(await ActorTriggerConfiguration.migrateLegacyAssignments(hero), 0);
  assert.equal(writes, 0);
});

test("a free-standing power reads its own assignments without an actor", () => {
  const loose = power("loose", [assign(TRIGGER_ID.FAILS_SAVING_THROW)]);

  assert.deepEqual(ActorTriggerConfiguration.assignmentsForItem(loose).map(assignment => assignment.triggerId), [TRIGGER_ID.FAILS_SAVING_THROW]);
});

test("saving a power's assignments stores them on the power as an array", async () => {
  const strike = power("strike", undefined);

  await ItemTriggerAssignments.write(strike, [assign(TRIGGER_ID.YOU_MISS, {}, "text")]);

  assert.equal(strike.flags[MODULE][FLAG].version, 1);
  assert.ok(Array.isArray(strike.flags[MODULE][FLAG].assignments));
  assert.deepEqual(ItemTriggerAssignments.read(strike), { configured: true, assignments: [assign(TRIGGER_ID.YOU_MISS, {}, "text")] });
});

test("the trigger text is read from either DnD4e shape", () => {
  assert.equal(ItemTriggerAssignments.getTriggerText({ system: { trigger: "An enemy hits you" } }), "An enemy hits you");
  assert.equal(ItemTriggerAssignments.getTriggerText({ system: { trigger: { value: "You miss" } } }), "You miss");
  assert.equal(ItemTriggerAssignments.getTriggerText({ system: {} }), "");
});

test("automatic benefits are explicit, survive configuration writes, and can be switched off", async () => {
  const item = power('mandatory', undefined);
  assert.equal(ItemTriggerAssignments.automatic(item), false);
  await ItemTriggerAssignments.write(item, [], 'day', true);
  assert.equal(ItemTriggerAssignments.automatic(item), true);
  await ItemTriggerAssignments.write(item, []);
  assert.equal(ItemTriggerAssignments.automatic(item), true);
  assert.equal(ItemTriggerAssignments.limit(item), 'day');
  await ItemTriggerAssignments.write(item, [], 'day', false);
  assert.equal(ItemTriggerAssignments.automatic(item), false);
});
