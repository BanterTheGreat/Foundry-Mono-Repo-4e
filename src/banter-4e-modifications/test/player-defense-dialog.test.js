import test from "node:test";
import assert from "node:assert/strict";
import { createDefenseDialogPayload } from "../scripts/modules/player-defense/player-defense-workflow.js";

test("defense dialog identifies the attacker, defense stat, modifier, and DC", () => {
  const payload = createDefenseDialogPayload({
    attackName: "Bite",
    attackerName: "Badger",
    defenseStat: "AC",
    defenseMod: 16,
    rollDC: 199,
  });

  assert.deepEqual(payload, {
    title: "Bite",
    content: "<p><b>Badger</b> is targeting your <b>AC</b> (+16)!</p>",
    defendLabel: "Defend Yourself! (DC 199)",
  });
});
