import test from "node:test";
import assert from "node:assert/strict";
import { localizeItemPowers } from "../scripts/localize-item-powers-api.js";
import { validateLocalizeItemPowers } from "../shared/localize-item-powers-data.js";

const sourceUuid = "Compendium.test.powers.Item.power";

/** Build document doubles that expose stored source and record only allowed mutations. */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), items: new Map(), folders: new Map(),
    packs: new Map([["test.powers", { documentName: "Item", testUserPermission: () => true }]]) };
  const doc = (uuid, source, extra = {}) => ({ uuid, id: uuid.split(".").at(-1), name: source.name, type: source.type,
    documentName: "Item", toObject: () => structuredClone(source), source,
    getFlag: (module, key) => source.flags?.[module]?.[key], testUserPermission: () => true, ...extra });
  const actor = { type: "Player Character", items: new Map() };
  game.actors.set("hero", actor);
  const updates = [];
  const equip = (id, links) => {
    const item = doc(`Actor.hero.Item.${id}`, { name: id, type: "weapon", system: { itemPowers: links, enhance: 2 },
      flags: { dnd4e: { concreteItemPowerIds: ["ownedPower"] } } }, { parent: actor });
    item.update = async patch => {
      updates.push(patch);
      item.source.system.itemPowers = structuredClone(patch["system.itemPowers"]);
    };
    actor.items.set(id, item);
    return item;
  };
  const weapon = equip("weapon", [sourceUuid, "Item.existing"]);
  const power = doc(sourceUuid, { _id: "power", name: "Guarding", type: "power", folder: "old", ownership: { default: 3 },
    system: { uses: { value: 1, max: "1", per: "day" }, trigger: "Hit", macros: [{ command: "preserved" }] },
    effects: [{ _id: "effect", name: "Dazed" }], flags: { other: { value: 1 } } }, { pack: "test.powers" });
  const created = [];
  const Item = { create: async data => {
    created.push(structuredClone(data));
    const item = doc(`Item.copy${created.length}`, data);
    game.items.set(item.id, item);
    return item;
  } };
  const Folder = { create: async data => {
    const folder = { ...data, id: `folder${game.folders.size}`, folder: game.folders.get(data.folder) ?? null };
    game.folders.set(folder.id, folder);
    return folder;
  } };
  return { game, Item, Folder, fromUuid: async () => power, confirm: async () => true,
    weapon, power, actor, equip, created, updates };
}
const request = { items: ["Actor.hero.Item.weapon"] };

test("copies full power once, uses nested Item folder, and changes only compendium links", async () => {
  const deps = fixture();
  const second = deps.equip("second", [sourceUuid]);
  const args = { items: [...request.items, second.uuid] };
  const result = await localizeItemPowers(args, deps);
  assert.equal(result.status, "updated");
  assert.equal(deps.created.length, 1);
  assert.deepEqual(deps.created[0].system, deps.power.source.system);
  assert.deepEqual(deps.created[0].effects, deps.power.source.effects);
  assert.deepEqual(deps.created[0].flags.other, { value: 1 });
  assert.equal(deps.created[0]._id, undefined);
  assert.equal(deps.created[0].ownership, undefined);
  assert.equal(deps.game.folders.get(deps.created[0].folder).name, "Item Powers");
  assert.deepEqual(deps.weapon.source.system.itemPowers, ["Item.copy1", "Item.existing"]);
  assert.deepEqual(second.source.system.itemPowers, ["Item.copy1"]);
  assert.equal(deps.weapon.source.system.enhance, 2);
  assert.deepEqual(deps.weapon.source.flags.dnd4e.concreteItemPowerIds, ["ownedPower"]);
  assert.ok(deps.updates.every(patch => Object.keys(patch).join() === "system.itemPowers"));
  deps.confirm = async () => assert.fail("No review for already local equipment");
  assert.equal((await localizeItemPowers(args, deps)).status, "unchanged");
});

test("partial relink failure reuses saved copy and preserves later local edits on retry", async () => {
  const deps = fixture();
  const update = deps.weapon.update;
  deps.weapon.update = async () => { throw new Error("failure"); };
  assert.equal((await localizeItemPowers(request, deps)).status, "incomplete");
  deps.game.items.get("copy1").source.system.trigger = "Local edit";
  deps.weapon.update = update;
  assert.equal((await localizeItemPowers(request, deps)).status, "updated");
  assert.equal(deps.created.length, 1);
  assert.equal(deps.game.items.get("copy1").source.system.trigger, "Local edit");
});

test("cancel, stale equipment/source, lost access and changed GM save no documents", async () => {
  for (const mode of ["cancel", "equipment", "source", "session", "access"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "equipment") {
        deps.weapon.source.system.enhance = 9;
      }
      if (mode === "source") {
        deps.power.source.system.trigger = "changed";
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (mode === "access") {
        deps.power.testUserPermission = () => false;
      }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await localizeItemPowers(request, deps)).status, "cancelled");
    } else {
      await assert.rejects(localizeItemPowers(request, deps));
    }
    assert.equal(deps.created.length, 0);
    assert.equal(deps.game.folders.size, 0);
    assert.equal(deps.updates.length, 0);
  }
});

test("reject missing, non-power and inaccessible sources, NPCs and non-equipment before review", async () => {
  for (const mode of ["missing", "feature", "access", "npc", "powerEquipment"]) {
    const deps = fixture();
    deps.confirm = async () => assert.fail("Invalid selections must not prompt");
    if (mode === "missing") {
      deps.fromUuid = async () => null;
    }
    if (mode === "feature") {
      deps.power.type = "feature";
    }
    if (mode === "access") {
      deps.power.testUserPermission = () => false;
    }
    if (mode === "npc") {
      deps.actor.type = "NPC";
    }
    if (mode === "powerEquipment") {
      deps.weapon.type = "power";
    }
    await assert.rejects(localizeItemPowers(request, deps));
    assert.equal(deps.created.length, 0);
  }
  for (const args of [{ items: [] }, { items: ["Item.world"] }, { ...request, system: {} },
    { items: [...request.items, ...request.items] }, { ...request, folder: "" }]) {
    assert.throws(() => validateLocalizeItemPowers(args));
  }
});
