import test from "node:test";
import assert from "node:assert/strict";
import { targetAutomation } from "../scripts/target-automation-api.js";
import { validateTargetAutomation } from "../shared/target-automation-data.js";
import * as rules from "../../dnd4e-health-display/scripts/power-activation/rules.js";

/**
 * Exercise real targeting defaults with Foundry document and session doubles.
 */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), items: new Map(),
    modules: new Map([["dnd4e-health-display", { active: true }]]) };
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
  return { game, item, actor, calls, rules: async () => rules, conditions: () => [{ id: "slowed" }], confirm: async () => true };
}
const edit = { powers: [{ uuid: "Item.power", config: { enabled: true, targetCount: 2 } }] };

test("real defaults are readable; confirmed patches preserve fields, review macro disabling and retry without prompting", async () => {
  const deps = fixture();
  assert.equal((await targetAutomation({ uuid: "Item.power" }, false, deps)).config.targetCount, 1);
  deps.confirm = async ({ changes }) => {
    assert.equal(deps.calls.length, 0);
    assert.ok(changes.some(change => change.path === "system.macros"));
    return true;
  };
  assert.equal((await targetAutomation(edit, true, deps)).status, "updated");
  assert.equal(deps.item.source.flags.other.keep, true);
  assert.deepEqual(deps.item.system.macros, [{ enabled: false, command: "untouched" }]);
  deps.confirm = async () => assert.fail("Identical edits must not prompt");
  assert.equal((await targetAutomation(edit, true, deps)).status, "unchanged");
});

test("cancellation, stale source, lost session and changed conditions never save", async () => {
  for (const mode of ["cancel", "stale", "session", "conditions"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") { deps.item.source.name = "changed"; }
      if (mode === "session") { deps.game.user.isActiveGM = false; }
      if (mode === "conditions") { deps.conditions = () => []; }
      return mode !== "cancel";
    };
    // The condition provider itself remains stable while its returned list changes.
    const options = { ...deps, conditions: () => deps.conditions() };
    if (mode === "cancel") {
      assert.equal((await targetAutomation(edit, true, options)).status, "cancelled");
    } else {
      await assert.rejects(targetAutomation(edit, true, options));
    }
    assert.equal(deps.calls.length, 0);
  }
});

test("batch reports partial saves and shared origins can be explicitly cleared", async () => {
  const deps = fixture();
  deps.item.update = async () => { throw new Error("failed"); };
  const result = await targetAutomation({ uuid: "Actor.hero", originActors: ["Actor.hero"], ...edit }, true, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 1);
  assert.equal((await targetAutomation({ uuid: "Actor.hero", originActors: [] }, true, deps)).status, "updated");
});

test("PC and NPC embedded powers inherit shared origins and custom origins replace them", async () => {
  for (const type of ["Player Character", "NPC"]) {
    const deps = fixture();
    deps.actor.type = type;
    deps.item.uuid = "Actor.hero.Item.power";
    deps.item.parent = deps.actor;
    deps.item.actor = deps.actor;
    deps.actor.items.set("power", deps.item);
    await targetAutomation({ uuid: "Actor.hero", originActors: ["Actor.hero"],
      powers: [{ uuid: deps.item.uuid, config: { enabled: true } }] }, true, deps);
    const inherited = await targetAutomation({ uuid: "Actor.hero" }, false, deps);
    assert.deepEqual(inherited.powers[0].origins, { originActors: ["Actor.hero"], allowCaster: true });
    await targetAutomation({ powers: [{ uuid: deps.item.uuid,
      config: { originMode: "custom", originActors: [], allowCaster: false } }] }, true, deps);
    const custom = await targetAutomation({ uuid: deps.item.uuid }, false, deps);
    assert.deepEqual(custom.origins, { originActors: [], allowCaster: false });
    assert.deepEqual(deps.actor.getFlag("dnd4e-health-display", "targetAutomation").originActors, ["Actor.hero"]);
  }
});

test("reject arbitrary fields, invalid enums/counts/destinations, attack summons and missing references before review", async () => {
  for (const config of [{ targetCount: 0 }, { wallHeight: 1.5 }, { originMode: "bad" }, { macros: [] }, { originActors: ["Scene.bad"] }]) {
    assert.throws(() => validateTargetAutomation({ powers: [{ uuid: "Item.power", config }] }, true));
  }
  for (const config of [{ enabled: true, placementMode: "summon", summonActor: "Actor.hero" },
    { targetCondition: "unknown" }, { originActors: ["Actor.missing"] }]) {
    const deps = fixture();
    deps.item.hasAttack = true;
    deps.confirm = async () => assert.fail("Invalid requests must not prompt");
    await assert.rejects(targetAutomation({ powers: [{ uuid: "Item.power", config }] }, true, deps));
    assert.equal(deps.calls.length, 0);
  }
});
