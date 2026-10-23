import test from "node:test";
import assert from "node:assert/strict";
import { fixPcItemIcons } from "../scripts/pc-item-icon-api.js";
import { DEFAULT_ITEM_ICON, PC_ITEM_ICONS } from "../shared/pc-item-icon-data.js";

/**
 * Model stored Item data and partial embedded updates without running Foundry.
 */
function fixture() {
  const calls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map()
  };
  const actor = { id: "pc", uuid: "Actor.pc", name: "Hero", type: "Player Character", items: new Map(),
    updateEmbeddedDocuments: async (type, updates) => {
      assert.equal(type, "Item");
      calls.push(updates);
      for (const update of updates) {
        if (actor.fail && update._id === "head") {
          throw new Error("Partial update");
        }
        actor.items.get(update._id).source.img = update.img;
      }
    }
  };
  game.actors.set(actor.id, actor);
  for (const slot of [...Object.keys(PC_ITEM_ICONS), "ring", "armour", "other", "constructor"]) {
    const source = { name: slot, type: "equipment", img: DEFAULT_ITEM_ICON,
      system: { armour: { type: slot }, equipped: false }, effects: [{ name: "Existing effect" }] };
    actor.items.set(slot, { id: slot, uuid: `Actor.pc.Item.${slot}`, source, toObject: () => structuredClone(source) });
  }
  return { game, actor, calls };
}

test("updates all six slots using only image patches and retries without writes", async () => {
  const deps = fixture();
  const before = structuredClone([...deps.actor.items.values()].map(item => item.source));
  const result = await fixPcItemIcons({ uuid: "Actor.pc" }, deps);
  assert.equal(result.status, "updated");
  assert.equal(result.items.length, 6);
  assert.deepEqual(deps.calls, [Object.entries(PC_ITEM_ICONS).map(([slot, img]) => ({ _id: slot, img }))]);
  for (const [index, item] of [...deps.actor.items.values()].entries()) {
    assert.deepEqual({ ...item.source, img: before[index].img }, before[index]);
  }
  assert.equal((await fixPcItemIcons({ uuid: "Actor.pc" }, deps)).status, "unchanged");
  assert.equal(deps.calls.length, 1);
});

test("preserves custom icons and items outside supported equipment slots", async () => {
  const deps = fixture();
  deps.actor.items.get("feet").source.img = "custom/boots.webp";
  deps.actor.items.get("head").source.type = "power";
  delete deps.actor.items.get("arms").source.system;
  const result = await fixPcItemIcons({ uuid: "Actor.pc" }, deps);
  assert.deepEqual(result.items.map(item => item.slot), ["neck", "waist", "hands"]);
  assert.equal(deps.actor.items.get("feet").source.img, "custom/boots.webp");
  assert.equal(deps.actor.items.get("ring").source.img, DEFAULT_ITEM_ICON);
});

test("supports world Item Piles NPC merchants while preserving stock data", async () => {
  const deps = fixture();
  deps.actor.type = "NPC";
  deps.game.modules = new Map([["item-piles", { active: true }]]);
  deps.game.itempiles = { API: { isItemPileMerchant: actor => actor === deps.actor } };
  const item = deps.actor.items.get("neck");
  item.source.system.quantity = 3;
  item.source.flags = { "item-piles": { item: { hidden: true } } };
  const before = structuredClone(item.source);
  assert.equal((await fixPcItemIcons({ uuid: "Actor.pc" }, deps)).status, "updated");
  assert.deepEqual({ ...item.source, img: before.img }, before);
  assert.equal((await fixPcItemIcons({ uuid: "Actor.pc" }, deps)).status, "unchanged");
  deps.game.modules.get("item-piles").active = false;
  await assert.rejects(fixPcItemIcons({ uuid: "Actor.pc" }, deps));
  deps.game.modules.get("item-piles").active = true;
  deps.game.itempiles.API.isItemPileMerchant = () => false;
  await assert.rejects(fixPcItemIcons({ uuid: "Actor.pc" }, deps));
});

test("rejects unsupported destinations, caller patches and invalid sessions before writing", async () => {
  for (const mutate of [
    deps => { deps.actor.type = "NPC"; },
    deps => { deps.actor.parent = {}; },
    deps => { deps.actor.pack = "pack"; },
    deps => { deps.game.actors.clear(); },
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.user.isGM = false; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.settings.get = () => false; },
    deps => { deps.assertConnection = () => { throw new Error("Disconnected"); }; }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(fixPcItemIcons({ uuid: "Actor.pc" }, deps));
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  for (const args of [{ uuid: "Compendium.pack.Actor.pc" }, { uuid: "Actor.pc", img: "custom.webp" }, {}]) {
    await assert.rejects(fixPcItemIcons(args, deps));
  }
  assert.equal(deps.calls.length, 0);
});

test("reports partial writes and safely completes remaining defaults on retry", async () => {
  const deps = fixture();
  deps.actor.fail = true;
  const result = await fixPcItemIcons({ uuid: "Actor.pc" }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.items[0].status, "updated");
  assert.equal(result.items[1].status, "missing");
  deps.actor.fail = false;
  assert.equal((await fixPcItemIcons({ uuid: "Actor.pc" }, deps)).items.length, 5);
});

test("rechecks the paired session after awaited writes", async () => {
  const deps = fixture();
  const update = deps.actor.updateEmbeddedDocuments;
  deps.actor.updateEmbeddedDocuments = async (...args) => {
    await update(...args);
    deps.game.user.id = "other";
  };
  await assert.rejects(fixPcItemIcons({ uuid: "Actor.pc" }, deps), /paired active GM/);
});
