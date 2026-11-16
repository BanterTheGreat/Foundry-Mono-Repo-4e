import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPrompts } from "../scripts/modules/trigger-prompts/trigger-prompts.js";
import { createPowerUsedEvent, getEventRoles } from "../scripts/modules/trigger-prompts/combat-events.js";
import { matchesTriggerFilters } from "../scripts/modules/trigger-prompts/trigger-filters.js";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";
import { findTriggerById } from "../scripts/modules/trigger-prompts/trigger-definitions.js";
import { evaluateTriggerDefinition } from "../scripts/modules/trigger-prompts/trigger-evaluator.js";

const item = { type: "power", uuid: "Actor.hero.Item.power", system: { useType: "daily", actionType: "minor" } };
const speaker = { scene: "scene", token: "hero", actor: "actor" };

test("native use hook reports one activation without requiring attacks or targets", async () => {
  const events = [];
  globalThis.game = { TriggerPrompts: { events: { emit: async event => events.push(event) } } };
  await TriggerPrompts.onDnd4eUsePower(item, speaker);
  await TriggerPrompts.onDnd4eUsePower({ ...item, type: "feat" }, speaker);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "power-used");
  assert.deepEqual(getEventRoles(events[0]), { subject: { sceneId: "scene", tokenId: "hero", actorId: "actor" } });
  item.system.useType = "encounter";
  assert.equal(events[0].usageType, "daily");
  item.system.useType = "daily";
});

test("usage and action filters allow alternatives within each and require both groups", () => {
  const event = createPowerUsedEvent(item, speaker);
  assert.equal(matchesTriggerFilters({}, event), true);
  assert.equal(matchesTriggerFilters({ usageTypes: ["daily", "encounter"], powerActions: ["minor"] }, event), true);
  for (const parameters of [{ usageTypes: ["atwill"] }, { powerActions: ["standard"] }, { usageTypes: ["invalid"] }]) {
    assert.equal(matchesTriggerFilters(parameters, event), false);
  }
  assert.equal(matchesTriggerFilters({ usageTypes: ["daily"] }, {}), false);
  assert.equal(matchesTriggerFilters({ powerActions: ["minor"] }, {}), false);
});

test("Uses Power evaluates the owning actor and carries filter metadata", () => {
  const actor = { id: "actor" };
  const token = { id: "hero", name: "Hero", actor };
  const services = { resolveToken: () => token, distanceSquares: () => 0 };
  const contexts = evaluateTriggerDefinition(findTriggerById("uses-power"), createPowerUsedEvent(item, speaker), services);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].actor, actor);
  assert.equal(matchesTriggerFilters({ usageTypes: ["daily"], powerActions: ["minor"] }, contexts[0]), true);
});

test("dialog exposes and round trips only supported usage and action selections", () => {
  globalThis.foundry = { utils: { escapeHTML: value => value } };
  const trigger = findTriggerById("uses-power");
  assert.equal(PowerTriggerDialog.triggerCategory(trigger), "Powers");
  const html = PowerTriggerDialog.renderFilters(trigger, { usageTypes: ["daily"], powerActions: ["minor"] });
  assert.match(html, /Usage Type/);
  assert.match(html, /Power Action/);
  assert.match(html, /value="daily" checked/);
  const data = new FormData();
  data.set("uses-power.enabled", "on");
  data.append("uses-power.usageTypes", "daily");
  data.append("uses-power.usageTypes", "bogus");
  data.append("uses-power.powerActions", "minor");
  assert.deepEqual(PowerTriggerDialog.readAssignments(data)[0].parameters, { usageTypes: ["daily"], powerActions: ["minor"] });
});
