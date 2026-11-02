import test from "node:test";
import assert from "node:assert/strict";
import { CombatTriggerDispatcher } from "../scripts/modules/trigger-prompts/combat-trigger-dispatcher.js";
import { createAttackResolvedEvent, createMovementCommittedEvent } from "../scripts/modules/trigger-prompts/combat-events.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";

const MODULE = "banter-4e-modifications";
const FLAG = "trigger-prompts";
const grid = 100;

/** A power carrying the given trigger assignments in its own flag. */
const power = (id, ...triggerIds) => ({
  id, type: "power", name: id, system: {},
  flags: { [MODULE]: { [FLAG]: { version: 1, assignments: triggerIds.map(triggerId => ({ triggerId, parameters: {}, source: "manual" })) } } },
});

/** An actor whose actor-level options are the supplied flag. */
const actor = (id, items = [], actorFlag = {}, { owners = [] } = {}) => ({
  id, uuid: `Actor.${id}`, items: new Map(items.map(item => [item.id, item])),
  getFlag: () => ({ assignments: [], ...actorFlag }),
  testUserPermission: user => owners.includes(user.id),
});

const token = (id, tokenActor, disposition, column, row = 0) => ({
  id, name: id, actor: tokenActor, disposition, x: column * grid, y: row * grid, width: 1, height: 1, parent: { id: "scene" },
});

/** Installs a world with a started combat and returns the prompt cards the dispatcher creates. */
function setUpWorld(tokens, { users = [{ id: "gm", active: true, isGM: true }], started = true } = {}) {
  const promptCards = [];
  globalThis.canvas = { grid: { size: grid } };
  globalThis.ui = { notifications: { error() {} } };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users,
    settings: { settings: new Map() },
    combat: { started, combatants: tokens.map(entry => ({ sceneId: "scene", tokenId: entry.id, actor: entry.actor })) },
    scenes: new Map([["scene", { grid: { size: grid }, tokens: new Map(tokens.map(entry => [entry.id, entry])) }]]),
  };
  const dispatcher = new CombatTriggerDispatcher({ createPromptCard: async card => promptCards.push(card) });
  return { dispatcher, promptCards };
}

const hit = (attacker, target, fields = {}) => createAttackResolvedEvent({
  outcome: "hit",
  attacker: { sceneId: "scene", tokenId: attacker.id },
  target: { sceneId: "scene", tokenId: target.id },
  defenseType: "ac",
  ...fields,
});

test("a hit prompts the target with its eligible configured power", async () => {
  const reaction = power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU);
  const hero = token("hero", actor("hero", [reaction]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero]);

  await dispatcher.handle(hit(enemy, hero));

  assert.equal(promptCards.length, 1);
  assert.equal(promptCards[0].trigger.id, TRIGGER_ID.ENEMY_HITS_YOU);
  assert.equal(promptCards[0].actor, hero.actor);
  assert.deepEqual(promptCards[0].assignments.map(assignment => assignment.itemId), ["retaliate"]);
  assert.deepEqual(promptCards[0].recipientIds, ["gm"]);
});

test("an actor with nothing assigned to the trigger receives no prompt", async () => {
  const hero = token("hero", actor("hero", [power("unrelated", TRIGGER_ID.YOU_MISS)]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero]);

  await dispatcher.handle(hit(enemy, hero));

  assert.deepEqual(promptCards, []);
});

test("nothing is evaluated outside a started combat", async () => {
  const hero = token("hero", actor("hero", [power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU)]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero], { started: false });

  await dispatcher.handle(hit(enemy, hero));

  assert.deepEqual(promptCards, []);
});

test("a prompt reaches the owning player without any GM connected", async () => {
  const hero = token("hero", actor("hero", [power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU)], {}, { owners: ["player"] }), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero], {
    users: [{ id: "gm", active: false, isGM: true }, { id: "player", active: true, isGM: false }, { id: "other", active: true, isGM: false }],
  });
  globalThis.game.user = { id: "player", isGM: false };

  await dispatcher.handle(hit(enemy, hero));

  assert.deepEqual(promptCards.map(card => card.recipientIds), [["player"]]);
});

test("every active GM and every active owner receives the prompt", async () => {
  const hero = token("hero", actor("hero", [power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU)], {}, { owners: ["p1", "p2"] }), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero], {
    users: [{ id: "gm1", active: true, isGM: true }, { id: "gm2", active: true, isGM: true }, { id: "p1", active: true, isGM: false }, { id: "p2", active: false, isGM: false }, { id: "p3", active: true, isGM: false }],
  });

  await dispatcher.handle(hit(enemy, hero));

  assert.deepEqual(promptCards[0].recipientIds, ["gm1", "gm2", "p1"]);
});

test("a prompt nobody can see is not created", async () => {
  const hero = token("hero", actor("hero", [power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU)]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero], { users: [{ id: "gm", active: false, isGM: true }] });

  await dispatcher.handle(hit(enemy, hero));

  assert.deepEqual(promptCards, []);
});

test("an assignment's range limits the prompt using footprint distance", async () => {
  const inRange = power("near", TRIGGER_ID.ENEMY_HITS_YOU);
  inRange.flags[MODULE][FLAG].assignments[0].parameters = { rangeSquares: 4 };
  const hero = token("hero", actor("hero", [inRange]), 1, 5);
  const closeEnemy = token("close", actor("close"), -1, 1);
  const farEnemy = token("far", actor("far"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([closeEnemy, farEnemy, hero]);

  await dispatcher.handle(hit(closeEnemy, hero));
  await dispatcher.handle(hit(farEnemy, hero));

  assert.equal(promptCards.length, 1, "distance 4 is in range, distance 5 is not");
  assert.equal(promptCards[0].context.distanceSquares, 4);
});

test("an actor-level reminder reaches the mark owner when its marked enemy hits an ally", async () => {
  const markerActor = actor("hero", [], { actorLevelTriggers: { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } } });
  const marker = token("hero", markerActor, 1, 0);
  const marked = token("enemy", { ...actor("enemy"), system: { marker: markerActor.uuid } }, -1, 1);
  const ally = token("ally", actor("ally"), 1, 2);
  const { dispatcher, promptCards } = setUpWorld([marker, marked, ally]);

  await dispatcher.handle(hit(marked, ally));

  assert.equal(promptCards.length, 1);
  assert.equal(promptCards[0].trigger.id, TRIGGER_ID.MARKED_ENEMY_HITS_ALLY);
  assert.equal(promptCards[0].actor, markerActor);
  assert.deepEqual(promptCards[0].assignments, [{}]);
});

test("a movement event prompts only enemies whose reach the path crosses", async () => {
  const opportunity = { id: "strike", type: "power", name: "strike", system: { attack: { isOpp: true } }, flags: {} };
  const guard = token("guard", actor("guard", [opportunity]), 1, 3, 1);
  const distant = token("distant", actor("distant", [{ ...opportunity, id: "far-strike" }]), 1, 3, 6);
  const runner = token("runner", actor("runner"), -1, 0, 0);
  const { dispatcher, promptCards } = setUpWorld([runner, guard, distant]);

  await dispatcher.handle(createMovementCommittedEvent({ sceneId: "scene", tokenId: "runner", path: [{ x: 0, y: 0 }, { x: 800, y: 0 }] }));

  assert.deepEqual(promptCards.map(card => card.actor.id), ["guard"]);
  assert.deepEqual(promptCards[0].assignments.map(assignment => assignment.itemId), ["strike"]);
});

test("a move that only ends beside an enemy does not prompt an opportunity attack", async () => {
  const opportunity = { id: "strike", type: "power", name: "strike", system: { attack: { isOpp: true } }, flags: {} };
  const guard = token("guard", actor("guard", [opportunity]), 1, 5, 0);
  const runner = token("runner", actor("runner"), -1, 4, 0);
  const { dispatcher, promptCards } = setUpWorld([runner, guard]);

  await dispatcher.handle(createMovementCommittedEvent({ sceneId: "scene", tokenId: "runner", path: [{ x: 0, y: 0 }, { x: 400, y: 0 }] }));

  assert.deepEqual(promptCards, []);
});

test("a failure delivering one prompt does not stop later triggers for the same event", async () => {
  const hero = token("hero", actor("hero", [power("one", TRIGGER_ID.ENEMY_HITS_YOU), power("two", TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK)]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero]);
  const originalConsoleError = console.error;
  console.error = () => {};
  let calls = 0;
  dispatcher.promptChat.createPromptCard = async card => {
    calls += 1;
    if (calls === 1) {
      throw new Error("chat failed");
    }
    promptCards.push(card);
  };

  try {
    await dispatcher.handle(hit(enemy, hero, { attackRange: "weapon" }));
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(promptCards.map(card => card.trigger.id), [TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK]);
});


test("native attack dispatch finds only a started encounter on its recorded scene when the viewed combat is transiently null", async () => {
  const hero = token("hero", actor("hero", [power("retaliate", TRIGGER_ID.ENEMY_HITS_YOU)]), 1, 1);
  const enemy = token("enemy", actor("enemy"), -1, 0);
  const { dispatcher, promptCards } = setUpWorld([enemy, hero]);
  const combat = { ...game.combat, scene: { id: "scene" } };
  game.combats = [combat];
  game.combat = null;
  await dispatcher.handle(hit(enemy, hero));
  assert.equal(promptCards.length, 1);
  game.combats = [{ ...combat, scene: { id: "different" } }];
  await dispatcher.handle(hit(enemy, hero));
  assert.equal(promptCards.length, 1);
});
