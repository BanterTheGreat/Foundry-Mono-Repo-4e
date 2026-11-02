import test from "node:test";
import assert from "node:assert/strict";
import { triggerAutomation } from "../scripts/trigger-automation-api.js";
import { validateTriggerAutomation } from "../shared/trigger-automation-data.js";
import { TRIGGERS } from "../../banter-4e-modifications/scripts/modules/trigger-prompts/trigger-definitions.js";
import * as filters from "../../banter-4e-modifications/scripts/modules/trigger-prompts/trigger-filters.js";
const registry = { TRIGGERS, ...filters };
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), items: new Map(),
    modules: new Map([["banter-4e-modifications", { active: true }]]) };
  const calls = [];
  const document = (uuid, source) => ({ uuid, id: uuid.split(".").at(-1), name: uuid,
    type: source.type, documentName: uuid.startsWith("Actor") ? "Actor" : "Item",
    system: source.system, hasAttack: source.system?.attack?.isAttack === true, source,
    getFlag: (module, flag) => source.flags?.[module]?.[flag], toObject: () => structuredClone(source),
    update: async patch => {
      calls.push(patch);
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.split(".");
        const last = keys.pop();
        const destination = keys.reduce((object, key) => object[key] ??= {}, source);
        destination[last] = structuredClone(value);
      }
    } });
  const item = document("Item.power", { type: "power", system: { rangeType: "range", macros: [{ enabled: true, command: "untouched" }] }, flags: { other: { keep: true } } });
  const actor = document("Actor.hero", { type: "Player Character" });
  actor.items = new Map();
  game.items.set("power", item);
  game.actors.set("hero", actor);
  return { game, item, actor, calls, rules: async () => registry, conditions: () => [{ id: "slowed" }], confirm: async () => true };
}

const edit = { items: [{ uuid: "Item.power", assignments: [{ triggerId: "you-take-damage", parameters: { damageTypes: ["fire"] } }], limit: "turn", automatic: true }] };
test("discover installed catalog and save confirmed assignments without touching macros or unrelated flags", async () => {
  const deps = fixture();
  assert.equal((await triggerAutomation({ uuid: "Item.power" }, false, deps)).catalog.length, TRIGGERS.length);
  assert.equal((await triggerAutomation(edit, true, deps)).status, "updated");
  assert.equal(deps.item.source.flags.other.keep, true);
  assert.equal(deps.item.system.macros[0].enabled, true);
  assert.equal(deps.item.source.flags["banter-4e-modifications"]["trigger-prompts"].automatic, true);
  deps.confirm = async () => assert.fail("Retry must not prompt");
  assert.equal((await triggerAutomation(edit, true, deps)).status, "unchanged");
});
test("cancel, stale source and lost GM session never save", async () => {
  for (const mode of ["cancel", "stale", "session"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") { deps.item.source.name = "changed"; }
      if (mode === "session") { deps.game.user.isActiveGM = false; }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await triggerAutomation(edit, true, deps)).status, "cancelled");
    } else {
      await assert.rejects(triggerAutomation(edit, true, deps));
    }
    assert.equal(deps.calls.length, 0);
  }
});
test("clear assignments, patch limits, preserve usage and edit actor opportunity options", async () => {
  const deps = fixture();
  await triggerAutomation(edit, true, deps);
  deps.item.source.flags["banter-4e-modifications"]["trigger-prompt-usage"] = { day: 1 };
  assert.equal((await triggerAutomation({ items: [{ uuid: "Item.power", assignments: [] }] }, true, deps)).status, "updated");
  const flags = deps.item.source.flags["banter-4e-modifications"];
  assert.deepEqual(flags["trigger-prompts"].assignments, []);
  assert.equal(flags["trigger-prompts"].limit, "turn");
  assert.deepEqual(flags["trigger-prompt-usage"], { day: 1 });
  assert.equal((await triggerAutomation({ uuid: "Actor.hero", opportunityAttack: { enabled: false, oncePerTurn: true } }, true, deps)).status, "updated");
});
test("reject scripts, unsupported destinations, duplicate triggers, bad filters and missing companions before review", async () => {
  for (const proposal of [
    { items: [{ uuid: "Compendium.foo.bar", limit: "turn" }] },
    { items: [{ uuid: "Item.power", assignments: [{ triggerId: "unknown" }] }] },
    { items: [{ uuid: "Item.power", assignments: [{ triggerId: "you-take-damage", parameters: { damageTypes: ["bogus"] } }] }] },
    { items: [{ uuid: "Item.power", assignments: [{ triggerId: "companion-hit" }] }] },
    { items: [{ uuid: "Item.power", assignments: [{ triggerId: "you-take-damage", parameters: { script: "evil" } }] }] },
    { items: [{ uuid: "Item.power", assignments: [{ triggerId: "you-miss" }, { triggerId: "you-miss" }] }] }
  ]) {
    const deps = fixture();
    deps.confirm = async () => assert.fail("Invalid edits must not prompt");
    await assert.rejects(triggerAutomation(proposal, true, deps));
  }
  assert.throws(() => validateTriggerAutomation({ items: [{ uuid: "Item.power", limit: "bad" }] }, true));
});
test("partial write failure returns applied receipts", async () => {
  const deps = fixture();
  deps.item.update = async () => { throw new Error("write failed"); };
  const result = await triggerAutomation(edit, true, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied, []);
});

test("legacy actor assignments block actor edits instead of hiding configuration", async () => {
  const deps = fixture();
  deps.actor.source.flags = { "banter-4e-modifications": { "trigger-prompts": { "you-miss": { enabled: true } } } };
  await assert.rejects(triggerAutomation({ uuid: "Actor.hero", opportunityAttack: { enabled: false } }, true, deps), /migration/);
  assert.equal(deps.calls.length, 0);
});
test("actor reminders use only installed actor-level IDs", async () => {
  const deps = fixture();
  const trigger = TRIGGERS.find(trigger => trigger.actorLevel);
  assert.ok(trigger);
  assert.equal((await triggerAutomation({ uuid: "Actor.hero", reminders: [{ triggerId: trigger.id, enabled: true }] }, true, deps)).status, "updated");
  await assert.rejects(triggerAutomation({ uuid: "Actor.hero", reminders: [{ triggerId: "you-miss", enabled: true }] }, true, deps));
});
