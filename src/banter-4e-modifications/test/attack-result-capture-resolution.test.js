import test from "node:test";
import assert from "node:assert/strict";
import { AttackResultCapture } from "../scripts/modules/trigger-prompts/attack-result-capture.js";

const attack = (name = "Bite", token = "attacker-token") => ({
  item: { name },
  target: {
    targets: [{ id: "target-token", actor: { id: "target-actor" }, document: { parent: { id: "scene" } } }],
    targDefValArray: [26],
    targDefArray: ["ac"],
    targetMissed: [],
  },
  speaker: { actor: "attacker-actor", token },
  sceneId: "scene",
});

test("discarding a Player Defense-intercepted attack prevents a later roll from producing a trigger result", () => {
  const capture = new AttackResultCapture();
  capture.capture(attack());

  capture.discard();

  assert.equal(capture.consume({ flavor: "Bite - Damage Roll", rolls: [{ total: 11, dice: [] }] }), null);
});

test("discarding by message removes only the capture that message belongs to", () => {
  const capture = new AttackResultCapture();
  capture.capture(attack("Bite", "wolf-token"));
  capture.capture(attack("Claw", "bear-token"));

  capture.discard({ flavor: "Bite attack", speaker: { token: "wolf-token" }, rolls: [{ total: 1 }] });

  assert.equal(capture.consume({ flavor: "Bite attack", speaker: { token: "wolf-token" }, rolls: [{ total: 20, dice: [] }] }), null);
  assert.notEqual(capture.consume({ flavor: "Claw attack", speaker: { token: "bear-token" }, rolls: [{ total: 20, dice: [] }] }), null);
});

test("discarding with nothing captured is harmless", () => {
  const capture = new AttackResultCapture();

  assert.doesNotThrow(() => capture.discard());
  assert.doesNotThrow(() => capture.discard({ flavor: "Nothing", rolls: [] }));
});
