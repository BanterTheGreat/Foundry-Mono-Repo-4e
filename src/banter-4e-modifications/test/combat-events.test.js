import test from "node:test";
import assert from "node:assert/strict";
import {
  COMBAT_EVENT_TYPE,
  CombatEventBus,
  MOVEMENT_TYPE,
  createAttackEventFromDefense,
  createAttackEventsFromCapture,
  createHpChangedEvent,
  createMovementCommittedEvent,
  determineAttackOutcome,
  getEventRoles,
  isMeleeRange,
} from "../scripts/modules/trigger-prompts/combat-events.js";

const capturedAttack = (overrides = {}) => ({
  attackId: "attack-1",
  sceneId: "scene",
  attackerTokenId: "wolf-token",
  attackRange: "weapon",
  total: 22,
  natural: 12,
  targets: [{ sceneId: "scene", tokenId: "hero-token", defense: 20, defenseType: "AC", missed: false }],
  ...overrides,
});

test("an attack total at or above the defense hits and below it misses", () => {
  assert.equal(determineAttackOutcome({ total: 20 }, { defense: 20 }), "hit");
  assert.equal(determineAttackOutcome({ total: 19 }, { defense: 20 }), "miss");
});

test("natural 1 always misses, natural 20 always hits, and a recorded miss wins", () => {
  assert.equal(determineAttackOutcome({ total: 40, natural: 1 }, { defense: 10 }), "miss");
  assert.equal(determineAttackOutcome({ total: 2, natural: 20 }, { defense: 30 }), "hit");
  assert.equal(determineAttackOutcome({ total: 40, natural: 12 }, { defense: 10, missed: true }), "miss");
});

test("an attack whose defense is unknown has no outcome", () => {
  assert.equal(determineAttackOutcome({ total: 20 }, { defense: null }), null);
  assert.equal(determineAttackOutcome({ total: 20 }, {}), null);
});

test("a captured attack becomes one event per target, with a shared attack ID", () => {
  const events = createAttackEventsFromCapture(capturedAttack({
    targets: [
      { sceneId: "scene", tokenId: "hero-token", defense: 20, defenseType: "AC", missed: false },
      { sceneId: "scene", tokenId: "ally-token", defense: 30, defenseType: "REF", missed: false },
      { sceneId: "scene", tokenId: "unknown-token", defense: null, defenseType: null, missed: false },
    ],
  }));

  assert.deepEqual(events.map(event => [event.target.tokenId, event.outcome, event.defenseType, event.attackId]), [
    ["hero-token", "hit", "ac", "attack-1"],
    ["ally-token", "miss", "ref", "attack-1"],
  ]);
  assert.equal(events[0].type, COMBAT_EVENT_TYPE.ATTACK_RESOLVED);
  assert.deepEqual(events[0].attacker, { sceneId: "scene", tokenId: "wolf-token" });
  assert.equal(events[0].isMelee, true);
  assert.notEqual(events[0].id, events[1].id);
});

test("a Player Defense result becomes the same attack event", () => {
  const event = createAttackEventFromDefense({
    attackerTokenId: "wolf-token", sceneId: "scene", targetTokenId: "hero-token", targetSceneId: "scene", defenseType: "WIL", attackRange: "Ranged 5",
  }, "miss");

  assert.equal(event.type, COMBAT_EVENT_TYPE.ATTACK_RESOLVED);
  assert.equal(event.outcome, "miss");
  assert.equal(event.defenseType, "wil");
  assert.equal(event.isMelee, false);
  assert.deepEqual(event.target, { sceneId: "scene", tokenId: "hero-token" });
});

test("only Weapon, Melee, and Melee X ranges are melee", () => {
  for (const range of ["weapon", "Weapon", "melee", "Melee 2", " melee 1 "]) {
    assert.equal(isMeleeRange(range), true, range);
  }
  for (const range of ["Ranged 10", "Close burst 2", "Melee touch", null, undefined, ""]) {
    assert.equal(isMeleeRange(range), false, String(range));
  }
});

test("an HP event flags a bloodied transition only when the threshold is crossed downward", () => {
  const build = (oldHp, newHp) => createHpChangedEvent({ sceneId: "s", tokenId: "t", oldHp, newHp, bloodiedThreshold: 10 });

  assert.equal(build(11, 10).becameBloodied, true);
  assert.equal(build(30, 1).becameBloodied, true);
  assert.equal(build(10, 5).becameBloodied, false);
  assert.equal(build(5, 30).becameBloodied, false);
  assert.equal(build(30, 11).becameBloodied, false);
});

test("a movement event records its path and defaults to a walk", () => {
  const event = createMovementCommittedEvent({ sceneId: "s", tokenId: "t", path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });

  assert.equal(event.movementType, MOVEMENT_TYPE.WALK);
  assert.deepEqual(event.mover, { sceneId: "s", tokenId: "t" });
  assert.equal(event.path.length, 2);
});

test("event roles name the tokens each event type involves", () => {
  const attack = createAttackEventsFromCapture(capturedAttack())[0];

  assert.deepEqual(Object.keys(getEventRoles(attack)), ["attacker", "target"]);
  assert.deepEqual(Object.keys(getEventRoles(createMovementCommittedEvent({ sceneId: "s", tokenId: "t", path: [] }))), ["mover"]);
  assert.deepEqual(getEventRoles({ type: "unknown" }), {});
});

test("the event bus delivers each event to every subscriber in order and survives a failing one", async () => {
  globalThis.game = { settings: { settings: new Map() } };
  globalThis.ui = { notifications: { error() {} } };
  const originalConsoleError = console.error;
  console.error = () => {};
  const calls = [];
  const bus = new CombatEventBus();
  bus.subscribe(event => { calls.push(["first", event.n]); });
  bus.subscribe(() => { throw new Error("broken listener"); });
  const unsubscribe = bus.subscribe(async event => { calls.push(["third", event.n]); });

  try {
    await bus.emitAll([{ n: 1 }, { n: 2 }]);
    unsubscribe();
    await bus.emit({ n: 3 });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(calls, [["first", 1], ["third", 1], ["first", 2], ["third", 2], ["first", 3]]);
});

test("captured critical verdicts remain per-target and never turn a miss into a critical hit", () => {
  const events = createAttackEventsFromCapture(capturedAttack({ targets: [
    { tokenId: "critical", defense: 20, isCritical: true },
    { tokenId: "normal", defense: 20, isCritical: false },
    { tokenId: "miss", defense: 30, isCritical: true },
  ] }));
  assert.deepEqual(events.map(event => [event.target.tokenId, event.outcome, event.isCritical]), [
    ["critical", "hit", true], ["normal", "hit", false], ["miss", "miss", false],
  ]);
});
