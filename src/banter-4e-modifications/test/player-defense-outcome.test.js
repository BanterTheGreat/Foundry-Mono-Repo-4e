import test from "node:test";
import assert from "node:assert/strict";
import { toTriggerAttackOutcome } from "../scripts/modules/player-defense/player-defense-outcome.js";

test("Player Defense translates normal and critical results to hits, and misses to misses", () => {
  assert.equal(toTriggerAttackOutcome("normal"), "hit");
  assert.equal(toTriggerAttackOutcome("critical"), "hit");
  assert.equal(toTriggerAttackOutcome("miss"), "miss");
});
