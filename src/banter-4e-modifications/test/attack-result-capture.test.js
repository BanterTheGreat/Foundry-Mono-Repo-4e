import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { AttackResultCapture } from "../scripts/modules/trigger-prompts/attack-result-capture.js";

const capture = (attackCapture, name, token, rangeType = "weapon") => attackCapture.capture({
  item: { name, rangeType },
  target: { targets: [{ id: "target", actor: { id: "hero" } }], targDefValArray: [24], targDefArray: ["ac"], targetMissed: [] },
  speaker: { actor: `${token}-actor`, token },
  sceneId: "scene",
});
const message = (flavor, token, total = 25) => ({
  flavor,
  speaker: { actor: `${token}-actor`, token },
  rolls: [{ total, dice: [{ faces: 20, results: [{ active: true, result: 20 }] }] }],
});

test("AttackResultCapture retains nonmatching messages and returns target and natural-roll data for its attack", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Bite", "wolf-token");

  assert.equal(attackCapture.consume({ flavor: "Claw attack", rolls: [{ total: 30 }] }), null);
  const result = attackCapture.consume(message("Bite attack", "wolf-token"));

  assert.match(result.attackId, /^attack-/);
  assert.deepEqual({ ...result, attackId: undefined }, {
    attackId: undefined,
    itemName: "Bite",
    itemUuid: null,
    isOpportunity: false,
    attackRange: "weapon",
    attackerActorId: "wolf-token-actor",
    attackerTokenId: "wolf-token",
    sceneId: "scene",
    targets: [{ actorId: "hero", tokenId: "target", sceneId: "scene", defense: 24, defenseType: "ac", missed: false, isCritical: false }],
    total: 25,
    natural: 20,
  });
});

test("a capture is consumed once", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Bite", "wolf-token");

  assert.notEqual(attackCapture.consume(message("Bite attack", "wolf-token")), null);
  assert.equal(attackCapture.consume(message("Bite attack", "wolf-token")), null);
});

test("simultaneous attacks by different creatures each claim their own capture", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Slam", "ogre-token");
  capture(attackCapture, "Slam", "troll-token");

  const troll = attackCapture.consume(message("Slam attack", "troll-token"));
  const ogre = attackCapture.consume(message("Slam attack", "ogre-token"));

  assert.equal(troll.attackerTokenId, "troll-token");
  assert.equal(ogre.attackerTokenId, "ogre-token");
  assert.notEqual(troll.attackId, ogre.attackId);
});

test("two identical attacks by one creature are matched in the order they were made", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Bite", "wolf-token");
  capture(attackCapture, "Bite", "wolf-token");

  const first = attackCapture.consume(message("Bite attack", "wolf-token"));
  const second = attackCapture.consume(message("Bite attack", "wolf-token"));

  const sequence = result => Number(result.attackId.split("-").at(-1));
  assert.equal(sequence(second), sequence(first) + 1);
});

test("a message from a different speaker does not claim the capture", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Bite", "wolf-token");

  assert.equal(attackCapture.consume(message("Bite attack", "dog-token")), null);
  assert.notEqual(attackCapture.consume(message("Bite attack", "wolf-token")), null);
});

test("a message without a roll never claims a capture", () => {
  const attackCapture = new AttackResultCapture();
  capture(attackCapture, "Bite", "wolf-token");

  assert.equal(attackCapture.consume({ flavor: "Bite attack", speaker: { token: "wolf-token" }, rolls: [] }), null);
  assert.notEqual(attackCapture.consume(message("Bite attack", "wolf-token")), null);
});

test("a capture whose message never arrives is forgotten", () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  try {
    const attackCapture = new AttackResultCapture();
    capture(attackCapture, "Bite", "wolf-token");
    mock.timers.tick(61_000);
    capture(attackCapture, "Claw", "bear-token");

    assert.equal(attackCapture.consume(message("Bite attack", "wolf-token")), null);
    assert.notEqual(attackCapture.consume(message("Claw attack", "bear-token")), null);
  } finally {
    mock.timers.reset();
  }
});


test("persisted native variance supplies the actual opportunity mode missing from the system's hook item", () => {
  for (const isOpp of [true, false]) {
    const pending = new AttackResultCapture();
    capture(pending, "Bite", "wolf-token");
    const result = pending.consume({ ...message("Bite", "wolf-token"), flags: { dnd4e: { variance: { isOpp } } } });
    assert.equal(result.isOpportunity, isOpp);
  }
});


test("automation's resolved weapon mode distinguishes a ranged or thrown weapon from generic Weapon range", () => {
  const pending = new AttackResultCapture();
  capture(pending, "Throw", "hero", "weapon");
  const result = pending.consume({ ...message("Throw", "hero"), flags: { "dnd4e-health-display": { attackResults: { triggerMetadata: { attackRange: "ranged" } } } } });
  assert.equal(result.attackRange, "ranged");
});


test("automation keeps the owning caster as attacker when the native speaker is a companion origin", () => {
  const pending = new AttackResultCapture();
  capture(pending, "Spirit Strike", "spirit", "melee");
  const result = pending.consume({ ...message("Spirit Strike", "spirit"), flags: { "dnd4e-health-display": { attackResults: { casterId: "hero", sceneId: "scene" } } } });
  assert.equal(result.attackerTokenId, "hero");
});

test("native critical verdicts survive capture per target without guessing from natural 20", () => {
  const recorder = new AttackResultCapture();
  capture(recorder, "Bite", "wolf-token");
  const chat = message("Bite attack", "wolf-token");
  chat.rolls[0].options = { multirollData: { targetID: "target", critstate: "critical" } };
  assert.equal(recorder.consume(chat).targets[0].isCritical, true);
  capture(recorder, "Bite", "wolf-token");
  chat.rolls[0].options.multirollData.critstate = "";
  assert.equal(recorder.consume(chat).targets[0].isCritical, false);
});
