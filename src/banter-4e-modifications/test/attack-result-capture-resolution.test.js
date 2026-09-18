import test from "node:test";
import assert from "node:assert/strict";
import { AttackResultCapture } from "../scripts/modules/trigger-prompts/attack-result-capture.js";

test("AttackResultCapture retains nonmatching messages and returns target and natural-roll data for its attack", () => {
  const capture = new AttackResultCapture();
  capture.capture({
    item: { name: "Bite", rangeType: "weapon" },
    target: { targets: [{ id: "target", actor: { id: "hero" } }], targDefValArray: [24], targDefArray: ["ac"], targetMissed: [] },
    speaker: { actor: "wolf", token: "wolf-token" },
    sceneId: "scene",
  });

  assert.equal(capture.consume({ flavor: "Claw attack", rolls: [{ total: 30 }] }), null);
  assert.deepEqual(capture.consume({
    flavor: "Bite attack",
    rolls: [{ total: 25, dice: [{ faces: 20, results: [{ active: true, result: 20 }] }] }],
  }), {
    itemName: "Bite",
    attackRange: "weapon",
    attackerActorId: "wolf",
    attackerTokenId: "wolf-token",
    sceneId: "scene",
    targets: [{ actorId: "hero", tokenId: "target", sceneId: "scene", defense: 24, defenseType: "ac", missed: false }],
    total: 25,
    natural: 20,
  });
});
