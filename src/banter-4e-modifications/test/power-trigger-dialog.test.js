import test from "node:test";
import assert from "node:assert/strict";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { findTriggerById } from "../scripts/modules/trigger-prompts/trigger-definitions.js";
import { suggestTriggersFromText } from "../scripts/modules/trigger-prompts/trigger-text-suggestions.js";

globalThis.foundry = { utils: { escapeHTML: text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") } };

/** A form whose controls are plain objects keyed by their field name. */
function createForm(assigned = []) {
  const elements = {};
  for (const trigger of PowerTriggerDialog.assignableTriggers()) {
    elements[`${trigger.id}.enabled`] = { checked: assigned.includes(trigger.id) };
    elements[`${trigger.id}.source`] = { value: "manual" };
    if (trigger.defaultRangeSquares !== undefined) {
      elements[`${trigger.id}.rangeSquares`] = { value: String(trigger.defaultRangeSquares) };
    }
  }
  return { elements };
}
const checkedIds = form => Object.entries(form.elements).filter(([name, control]) => name.endsWith(".enabled") && control.checked).map(([name]) => name.replace(".enabled", ""));

test("opportunity attacks and actor-level reminders are not assignable to a power", () => {
  const ids = PowerTriggerDialog.assignableTriggers().map(trigger => trigger.id);

  assert.ok(!ids.includes(TRIGGER_ID.OPPORTUNITY_ATTACK));
  assert.ok(!ids.includes(TRIGGER_ID.MARKED_ENEMY_HITS_ALLY));
  assert.ok(ids.includes(TRIGGER_ID.ENEMY_HITS_YOU));
});

test("enabling suggestions ticks the suggested rows and sets their range from the text", () => {
  const form = createForm();

  PowerTriggerDialog.applySuggestions(form, suggestTriggersFromText("An enemy within 4 squares of you hits you"));

  assert.deepEqual(checkedIds(form), [TRIGGER_ID.ENEMY_HITS_YOU]);
  assert.equal(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`].value, "4");
  assert.equal(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.source`].value, "text");
});

test("disabling suggestions puts every row back as the user had it", () => {
  const form = createForm([TRIGGER_ID.YOU_MISS]);
  form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`].value = "7";

  const previous = PowerTriggerDialog.applySuggestions(form, suggestTriggersFromText("An enemy within 4 squares of you hits you"));
  PowerTriggerDialog.restoreForm(form, previous);

  assert.deepEqual(checkedIds(form), [TRIGGER_ID.YOU_MISS]);
  assert.equal(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`].value, "7");
  assert.equal(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.source`].value, "manual");
});

test("a suggestion for an actor-level reminder never ticks a power row", () => {
  const form = createForm();

  PowerTriggerDialog.applySuggestions(form, suggestTriggersFromText("An enemy marked by you hits an ally"));

  assert.deepEqual(checkedIds(form), []);
});

test("text with no known trigger leaves the form untouched", () => {
  const form = createForm([TRIGGER_ID.YOU_MISS]);

  PowerTriggerDialog.applySuggestions(form, suggestTriggersFromText("You roll initiative"));

  assert.deepEqual(checkedIds(form), [TRIGGER_ID.YOU_MISS]);
});

test("saving stores only ticked rows, with their range and where each came from", () => {
  const data = new FormData();
  data.append(`${TRIGGER_ID.ENEMY_HITS_YOU}.enabled`, "on");
  data.append(`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`, "4");
  data.append(`${TRIGGER_ID.ENEMY_HITS_YOU}.source`, "text");
  data.append(`${TRIGGER_ID.YOU_MISS}.enabled`, "on");
  data.append(`${TRIGGER_ID.YOU_MISS}.source`, "manual");
  data.append(`${TRIGGER_ID.ENEMY_MISSES_YOU}.source`, "manual");

  assert.deepEqual(PowerTriggerDialog.readAssignments(data), [
    { triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: { rangeSquares: 4 }, source: "text" },
    { triggerId: TRIGGER_ID.YOU_MISS, parameters: {}, source: "manual" },
  ]);
});

test("a blank, negative, or invalid range falls back sensibly when saving", () => {
  const read = range => {
    const data = new FormData();
    data.append(`${TRIGGER_ID.ENEMY_HITS_YOU}.enabled`, "on");
    data.append(`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`, range);
    return PowerTriggerDialog.readAssignments(data)[0].parameters.rangeSquares;
  };

  assert.equal(read(""), findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU).defaultRangeSquares);
  assert.equal(read("abc"), findTriggerById(TRIGGER_ID.ENEMY_HITS_YOU).defaultRangeSquares);
  assert.equal(read("-3"), 0);
});

test("an unknown source value is stored as manual", () => {
  const data = new FormData();
  data.append(`${TRIGGER_ID.YOU_MISS}.enabled`, "on");
  data.append(`${TRIGGER_ID.YOU_MISS}.source`, "something-else");

  assert.equal(PowerTriggerDialog.readAssignments(data)[0].source, "manual");
});

test("the suggestion panel shows the trigger text, what matched, and what is not checked", () => {
  const text = "An enemy misses you with a melee attack";

  const html = PowerTriggerDialog.renderSuggestionPanel(text, suggestTriggersFromText(text));

  assert.match(html, /Power trigger:<\/strong> An enemy misses you with a melee attack/);
  assert.match(html, /<strong>Enemy misses you<\/strong> — matched “misses you”/);
  assert.match(html, /Not checked: “with a melee attack”/);
  assert.match(html, /Nothing changes until you press Save/);
  assert.match(html, /name="suggestFromText"/);
  assert.match(html, /trigger-prompts-suggestions__panel" hidden/, "the panel starts hidden");
});

test("the suggestion panel says plainly when nothing is recognised", () => {
  const html = PowerTriggerDialog.renderSuggestionPanel("You roll initiative", []);

  assert.match(html, /No known trigger matches this text/);
});

test("a power without a trigger line offers no suggestion control", () => {
  const html = PowerTriggerDialog.renderSuggestionPanel("", []);

  assert.match(html, /no trigger line/);
  assert.doesNotMatch(html, /suggestFromText/);
});

test("the suggestion panel escapes the power's text", () => {
  const html = PowerTriggerDialog.renderSuggestionPanel("<img src=x onerror=alert(1)>", []);

  assert.doesNotMatch(html, /<img/);
});

test("a reminder suggestion points the user to the actor dialog", () => {
  const text = "An enemy marked by you hits an ally";

  const html = PowerTriggerDialog.renderSuggestionPanel(text, suggestTriggersFromText(text));

  assert.match(html, /set on the actor's Trigger prompts dialog/);
});

test("an assignment row shows its source badge only for text-derived assignments", () => {
  const trigger = findTriggerById(TRIGGER_ID.YOU_MISS);

  assert.match(PowerTriggerDialog.renderAssignmentRow(trigger, { parameters: {}, source: "text" }), /from trigger text/);
  assert.doesNotMatch(PowerTriggerDialog.renderAssignmentRow(trigger, { parameters: {}, source: "manual" }), /from trigger text/);
  assert.doesNotMatch(PowerTriggerDialog.renderAssignmentRow(trigger, undefined), /checked/);
  assert.match(PowerTriggerDialog.renderAssignmentRow(trigger, { parameters: {}, source: "manual" }), /checked/);
});
