import test from "node:test";
import assert from "node:assert/strict";
import { createDefenseDialogPayload } from "../scripts/modules/player-defense/player-defense-workflow.js";

test("defense dialog expands the math breakdown when its DC box is clicked", () => {
  const payload = createDefenseDialogPayload({
    attackName: "Bite",
    attackerName: "Badger",
    defenseStat: "AC",
    defenseMod: 16,
    rollDC: 199,
    attackModifier: 187,
    baseDefense: 10,
    reversedRollOffset: 2,
  });

  assert.equal(payload.title, "Badger - Bite");
  assert.equal(payload.defendLabel, "Defend Yourself");
  assert.doesNotMatch(payload.content, /Badger - Bite/);
  assert.match(payload.content, /Armor check/);
  assert.match(payload.content, /DC 199/);
  assert.match(payload.content, /Roll 1d20 \+ 16 to defend/);
  assert.match(payload.content, /<details class="player-defense-dialog__breakdown">\s*<summary class="player-defense-dialog__check" aria-label="Show defense and DC breakdown">/);
  assert.match(payload.content, /player-defense-dialog__disclosure-icon" aria-hidden="true"/);
  assert.match(payload.content, /Your AC<\/span><b>26<\/b>/);
  assert.match(payload.content, /Defense bonus<\/span><b>\+16<\/b>/);
  assert.match(payload.content, /Attack modifier<\/span><b>\+187<\/b>/);
  assert.match(payload.content, /Reversal adjustment<\/span><b>\+2<\/b>/);
});

test("defense dialog presents player-facing failure and success consequences", () => {
  const payload = createDefenseDialogPayload({
    attackName: "Spear",
    attackerName: "Kobold Elite",
    defenseStat: "Willpower",
    defenseMod: 14,
    rollDC: 11,
    attackModifier: -1,
    baseDefense: 10,
    reversedRollOffset: 2,
    hitText: "The target falls prone.",
    missText: "",
  });

  assert.match(payload.content, /Willpower check/);
  assert.match(payload.content, /Consequences/);
  assert.match(payload.content, /On failure/);
  assert.match(payload.content, /Your character falls prone/);
  assert.match(payload.content, /On success/);
  assert.match(payload.content, /Nothing happens/);
});

test("defense dialog expands DnD4e's abbreviated defense names", () => {
  for (const [defenseStat, checkName] of [["REF", "Reflex"], ["FORT", "Fortitude"], ["WILL", "Willpower"]]) {
    const payload = createDefenseDialogPayload({
      attackName: "Test Power",
      attackerName: "Test Attacker",
      defenseStat,
      defenseMod: 1,
      rollDC: 11,
      attackModifier: -1,
      baseDefense: 10,
      reversedRollOffset: 2,
    });

    assert.match(payload.content, new RegExp(`${checkName} check`));
  }
});
