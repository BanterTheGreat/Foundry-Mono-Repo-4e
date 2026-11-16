import test from "node:test";
import assert from "node:assert/strict";
import { linkItemPowers } from "../scripts/item-power-link-api.js";
import { validateItemPowerLinks } from "../shared/item-power-link-data.js";

/**
 * Model world equipment, a merchant copy and existing world powers.
 */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, items: new Map(), actors: new Map() };
  const actor = { uuid: "Actor.merchant", type: "NPC", items: new Map() };
  game.actors.set("merchant", actor);
  const writes = [];
  for (const [uuid, parent] of [["Item.one", null], ["Actor.merchant.Item.two", actor], ["Item.power", null]]) {
    const type = uuid === "Item.power" ? "power" : "weapon";
    const source = { name: uuid, type, system: { enhance: 2, damageDice: { parts: [{ numDice: "2", numFaces: "6" }] },
      itemPowers: ["Item.old"], description: { value: "Rules", chat: "Flavor" } },
      effects: [{ name: "Effect" }], flags: { original: true } };
    const item = { uuid, parent, type, name: uuid, source,
      toObject: () => structuredClone(source), update: async patch => {
        writes.push(uuid);
        source.system.itemPowers = [...patch["system.itemPowers"]];
        // Updating may mutate the caller's update data.
        delete patch["system.itemPowers"];
        patch.system = structuredClone(source.system);
      } };
    (parent?.items ?? game.items).set(uuid.split(".").at(-1), item);
  }
  return { game, writes, confirm: async () => true };
}
const request = { items: [
  { uuid: "Item.one", powers: ["Item.power"] },
  { uuid: "Actor.merchant.Item.two", powers: ["Item.power"] }
] };

test("append links on world and merchant equipment, preserving data and order; retries do not duplicate links", async () => {
  const deps = fixture();
  const before = deps.game.items.get("one").toObject();
  assert.equal((await linkItemPowers(request, deps)).status, "updated");
  assert.deepEqual(deps.game.items.get("one").toObject(), { ...before,
    system: { ...before.system, itemPowers: ["Item.old", "Item.power"] } });
  assert.deepEqual(deps.game.actors.get("merchant").items.get("two").source.system.itemPowers, ["Item.old", "Item.power"]);
  deps.confirm = async () => assert.fail("No-op retry must not prompt");
  assert.equal((await linkItemPowers(request, deps)).status, "unchanged");
  assert.equal(deps.writes.length, 2);
});

test("cancel, changed equipment/power, actor replacement and lost session prevent writes", async () => {
  for (const mode of ["cancel", "equipment", "power", "actor", "session"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "equipment") {
        deps.game.items.get("one").source.system.enhance = 3;
      }
      if (mode === "power") {
        deps.game.items.get("power").source.system.description.value = "Changed";
      }
      if (mode === "actor") {
        deps.game.actors.set("merchant", { ...deps.game.actors.get("merchant") });
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await linkItemPowers(request, deps)).status, "cancelled");
    } else {
      await assert.rejects(linkItemPowers(request, deps));
    }
    assert.equal(deps.writes.length, 0);
  }
});

test("partial writes report receipts and retry only unsaved equipment", async () => {
  const deps = fixture();
  const second = deps.game.actors.get("merchant").items.get("two");
  const update = second.update;
  second.update = async () => { throw new Error("save failed"); };
  const result = await linkItemPowers(request, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied, [{ uuid: "Item.one", itemPowers: ["Item.old", "Item.power"] }]);
  second.update = update;
  assert.equal((await linkItemPowers(request, deps)).status, "updated");
  assert.equal(deps.writes.length, 2);
});

test("reject unsupported sources, targets, invalid existing links and arbitrary patches before review", async () => {
  for (const args of [{ items: [] }, { items: [request.items[0], request.items[0]] },
    { items: [{ uuid: "Item.one", powers: [] }] },
    { items: [{ uuid: "Item.one", powers: ["Item.power", "Item.power"] }] },
    { items: [{ uuid: "Compendium.pack.Item.one", powers: ["Item.power"] }] },
    { items: [{ uuid: "Item.one", powers: ["Actor.hero.Item.power"] }] },
    { items: [{ ...request.items[0], system: {} }] }]) {
    assert.throws(() => validateItemPowerLinks(args));
  }
  for (const mode of ["token", "powerPack", "powerParent", "notPower", "missingPower", "notEquipment", "invalidLinks"]) {
    const deps = fixture();
    if (mode === "token") {
      deps.game.actors.get("merchant").isToken = true;
    }
    if (mode === "powerPack") {
      deps.game.items.get("power").pack = "pack";
    }
    if (mode === "powerParent") {
      deps.game.items.get("power").parent = {};
    }
    if (mode === "notPower") {
      deps.game.items.get("power").type = "weapon";
    }
    if (mode === "missingPower") {
      deps.game.items.delete("power");
    }
    if (mode === "notEquipment") {
      deps.game.items.get("one").type = "power";
    }
    if (mode === "invalidLinks") {
      deps.game.items.get("one").source.system.itemPowers = [123];
    }
    deps.confirm = async () => assert.fail("Invalid targets must not prompt");
    await assert.rejects(linkItemPowers(request, deps));
    assert.equal(deps.writes.length, 0);
  }
});

test("PC equipment is supported and concurrent review/caller mutation cannot alter approved links", async () => {
  const deps = fixture();
  deps.game.actors.get("merchant").type = "Player Character";
  let finish;
  deps.confirm = () => new Promise(resolve => { finish = resolve; });
  const args = structuredClone(request);
  const running = linkItemPowers(args, deps);
  args.items[0].powers.push("Item.other");
  await assert.rejects(linkItemPowers(request, deps), /awaiting confirmation/);
  finish(true);
  assert.equal((await running).status, "updated");
  assert.deepEqual(deps.game.items.get("one").source.system.itemPowers, ["Item.old", "Item.power"]);
});
