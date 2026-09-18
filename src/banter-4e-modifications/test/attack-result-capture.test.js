import test from "node:test";
import assert from "node:assert/strict";
import { AttackResultCapture } from "../scripts/modules/trigger-prompts/attack-result-capture.js";

const attack = {
  item: { name: "Bite" },
  target: {
    targets: [{ id: "target-token", actor: { id: "target-actor" }, document: { parent: { id: "scene" } } }],
    targDefValArray: [26],
    targDefArray: ["ac"],
    targetMissed: [],
  },
  speaker: { actor: "attacker-actor", token: "attacker-token" },
  sceneId: "scene",
};

test("discarding a Player Defense-intercepted attack prevents a later roll from producing a trigger result", () => {
  const capture = new AttackResultCapture();
  capture.capture(attack);

  capture.discard();

  assert.equal(capture.consume({ flavor: "Bite - Damage Roll", rolls: [{ total: 11, dice: [] }] }), null);
});
