import test from "node:test";
import assert from "node:assert/strict";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { normalizeTriggerText, suggestTriggersFromText } from "../scripts/modules/trigger-prompts/trigger-text-suggestions.js";

const ids = text => suggestTriggersFromText(text).map(suggestion => suggestion.triggerId);

test("new bloodied and ally-defeat suggestions retain an explicit non-minion restriction", () => {
  const [bloodied] = suggestTriggersFromText("You bloody a non-minion enemy");
  assert.equal(bloodied.triggerId, TRIGGER_ID.YOU_BLOODY_ENEMY);
  assert.deepEqual(bloodied.parameters, { nonMinion: true });
  assert.deepEqual(ids("An ally is reduced to 0 hit points or below"), [TRIGGER_ID.ALLY_REDUCED_TO_ZERO]);
});

test("defeat trigger wording suggests the matching trigger", () => {
  assert.deepEqual(ids("You reduce an enemy to 0 HP"), [TRIGGER_ID.YOU_REDUCE_ENEMY_TO_ZERO]);
  assert.deepEqual(ids("An enemy adjacent to you is reduced to 0 hit points or fewer"), [TRIGGER_ID.ADJACENT_ENEMY_REDUCED_TO_ZERO]);
});

test("normalizing strips markup, the Trigger label, punctuation, and case", () => {
  assert.equal(normalizeTriggerText("<b>Trigger:</b> An Enemy’s   hit. "), "an enemy's hit");
  assert.equal(normalizeTriggerText(null), "");
});

test("text that names no known trigger suggests nothing", () => {
  assert.deepEqual(suggestTriggersFromText(""), []);
  assert.deepEqual(suggestTriggersFromText("You roll initiative"), []);
  assert.deepEqual(ids("You take damage from an attack"), [TRIGGER_ID.YOU_TAKE_DAMAGE]);
});

test("plain wording maps to one trigger with nothing left unchecked", () => {
  const cases = {
    "An enemy hits you": TRIGGER_ID.ENEMY_HITS_YOU,
    "You are hit by an attack": TRIGGER_ID.ENEMY_HITS_YOU,
    "An enemy misses you with an attack": TRIGGER_ID.ENEMY_MISSES_YOU,
    "You miss with an attack": TRIGGER_ID.YOU_MISS,
    "You fail a saving throw": TRIGGER_ID.FAILS_SAVING_THROW,
    "An enemy bloodies you": TRIGGER_ID.YOU_BECOME_BLOODIED,
    "You are first bloodied": TRIGGER_ID.YOU_BECOME_BLOODIED,
    "An enemy marked by you becomes bloodied": TRIGGER_ID.MARKED_CREATURE_BLOODIED,
    "An attack against your AC or Reflex misses you": TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU,
  };

  for (const [text, triggerId] of Object.entries(cases)) {
    const suggestions = suggestTriggersFromText(text);
    assert.deepEqual(suggestions.map(suggestion => suggestion.triggerId), [triggerId], text);
    assert.deepEqual(suggestions[0].uncheckedText, [], text);
  }
});

test("the most specific trigger replaces the general one it contains", () => {
  assert.deepEqual(ids("An enemy hits you with a melee attack"), [TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK]);
  assert.deepEqual(ids("An enemy misses you or an ally"), [TRIGGER_ID.ENEMY_MISSES_ALLY]);
  assert.deepEqual(ids("An attack against your AC or Reflex misses you"), [TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU]);
});

test("a distance in the text becomes the suggested range for triggers that take one", () => {
  const [suggestion] = suggestTriggersFromText("An enemy within 5 squares of you hits you");

  assert.equal(suggestion.triggerId, TRIGGER_ID.ENEMY_HITS_YOU);
  assert.deepEqual(suggestion.parameters, { rangeSquares: 5 });
  assert.deepEqual(suggestion.uncheckedText, []);
  assert.deepEqual(suggestTriggersFromText("An attack misses an ally within 10 squares of you")[0].parameters, { rangeSquares: 10 });
});

test("a distance the trigger cannot use is reported as unchecked", () => {
  const [suggestion] = suggestTriggersFromText("An enemy within 5 squares of you misses you with an attack");

  assert.equal(suggestion.triggerId, TRIGGER_ID.ENEMY_MISSES_YOU);
  assert.deepEqual(suggestion.parameters, {});
  assert.deepEqual(suggestion.uncheckedText, ["within 5 squares of you"]);
});

test("wording a trigger does not enforce is reported in the power's own words", () => {
  assert.deepEqual(suggestTriggersFromText("An enemy misses you with a melee attack")[0].uncheckedText, ["with a melee attack"]);
  assert.deepEqual(suggestTriggersFromText("You miss with an attack while raging")[0].uncheckedText, ["while raging"]);
  assert.deepEqual(suggestTriggersFromText("You are hit by a ranged attack")[0].uncheckedText, ["ranged attack"]);
  assert.deepEqual(suggestTriggersFromText("An enemy marked by you moves without shifting")[0].uncheckedText, ["without shifting"]);
});

test("an alternative the trigger cannot express is not silently dropped", () => {
  const [suggestion] = suggestTriggersFromText("An enemy bloodies you or scores a critical hit against you.");

  assert.equal(suggestion.triggerId, TRIGGER_ID.YOU_BECOME_BLOODIED);
  assert.deepEqual(suggestion.uncheckedText, ["or scores a critical hit against you"]);
});

test("being bloodied as a state is not a transition", () => {
  assert.deepEqual(ids("You take damage from an enemy's attack while you are bloodied"), [TRIGGER_ID.YOU_TAKE_DAMAGE]);
  assert.deepEqual(ids("You are hit and damaged by an enemy's attack while you are bloodied."), []);
  assert.deepEqual(ids("You miss with an at-will attack power while you are bloodied."), [TRIGGER_ID.YOU_MISS]);
});

test("an attack that only hits or misses you does not claim the miss-only trigger", () => {
  assert.deepEqual(ids("An enemy hits or misses you with a melee attack"), []);
});

test("a mark-related trigger the actor owns is suggested but not assignable to a power", () => {
  const [suggestion] = suggestTriggersFromText("An enemy marked by you hits an ally");

  assert.equal(suggestion.triggerId, TRIGGER_ID.MARKED_ENEMY_HITS_ALLY);
  assert.equal(suggestion.assignable, false);
});

test("mark movement keeps adjacency as covered wording but reports the rest", () => {
  const [suggestion] = suggestTriggersFromText("An adjacent enemy marked by you shifts");

  assert.equal(suggestion.triggerId, TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT);
  assert.deepEqual(suggestion.uncheckedText, []);
});
