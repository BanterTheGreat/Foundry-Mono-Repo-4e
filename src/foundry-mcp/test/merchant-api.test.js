import test from "node:test";
import assert from "node:assert/strict";
import { getMerchantInventory, editMerchantInventory } from "../scripts/merchant-api.js";
import { validateMerchantRequest } from "../shared/merchant-data.js";

/**
 * Model stock documents, retry flags and ordinary Foundry embedded writes.
 */
function fixture() {
  const calls = [];
  const get = (obj, path) => path.split(".").reduce((value, key) => value?.[key], obj);
  const put = (obj, path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((target, key) => target[key] ??= {}, obj)[last] = structuredClone(value);
  };
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), items: new Map(), packs: new Map(),
    modules: new Map([["item-piles", { active: true }]]) };
  const actor = { id: "merchant", uuid: "Actor.merchant", type: "NPC", name: "Shop", items: new Map(), flags: {},
    getFlag: (scope, path) => get(actor.flags[scope], path),
    setFlag: async (scope, path, value) => {
      calls.push("flag");
      actor.flags[scope] ??= {};
      put(actor.flags[scope], path, value);
    },
    toObject: () => ({ name: actor.name, flags: structuredClone(actor.flags), items: [...actor.items.values()].map(item => item.toObject()) }),
    createEmbeddedDocuments: async (type, data) => {
      assert.equal(type, "Item");
      calls.push("add");
      return data.map(source => makeItem(`new${actor.items.size}`, source));
    },
    updateEmbeddedDocuments: async (type, data) => {
      assert.equal(type, "Item");
      calls.push("quantity");
      if (actor.fail) {
        throw new Error("Save failed");
      }
      for (const { _id, ...patch } of data) {
        for (const [path, value] of Object.entries(patch)) {
          put(actor.items.get(_id).source, path, value);
        }
      }
    },
    deleteEmbeddedDocuments: async (type, ids) => {
      assert.equal(type, "Item");
      calls.push("remove");
      ids.forEach(id => actor.items.delete(id));
    }
  };
  function makeItem(id, source, parent = actor) {
    source = structuredClone(source);
    const item = { id, uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`, parent, documentName: "Item",
      name: source.name, type: source.type, source, toObject: () => structuredClone(source),
      getFlag: (scope, path) => get(source.flags?.[scope], path), testUserPermission: () => true };
    (parent?.items ?? game.items).set(id, item);
    return item;
  }
  game.actors.set(actor.id, actor);
  game.itempiles = { API: { ITEM_QUANTITY_ATTRIBUTE: "system.quantity",
    isItemPileMerchant: () => true, getActorItems: target => [...target.items.values()] } };
  const source = { name: "Potion", type: "consumable", system: { quantity: 4 }, effects: [{ name: "Healing" }],
    flags: { "item-piles": { item: { infiniteQuantity: "yes" } } } };
  makeItem("stock", source);
  makeItem("trait", { name: "Trait", type: "feature", system: {} });
  const template = makeItem("potion", source, null);
  return { game, actor, template, calls, confirm: async () => true, fromUuid: async () => template };
}

const request = { uuid: "Actor.merchant", requestId: "merchant-request-1", add: [{ uuid: "Item.potion", quantity: 7 }],
  quantities: [{ id: "stock", quantity: 0 }] };

test("merchant inventory reads physical stock with pagination and Item Piles properties", async () => {
  const deps = fixture();
  const result = await getMerchantInventory({ uuid: request.uuid, query: "pot", limit: 1 }, deps);
  assert.equal(result.total, 1);
  assert.equal(result.entries[0].id, "stock");
  assert.equal(result.entries[0].quantity, 4);
  assert.equal(result.entries[0].itemPiles.item.infiniteQuantity, "yes");
  assert.deepEqual(deps.calls, []);
});

test("review stock addition and absolute zero quantity; preserve mechanics and replay safely", async () => {
  const deps = fixture();
  deps.confirm = async ({ changes, summary }) => {
    assert.deepEqual(deps.calls, []);
    assert.equal(changes.length, 2);
    assert.match(summary, /merchant inventory/);
    return true;
  };
  const result = await editMerchantInventory(request, deps);
  assert.equal(result.status, "updated");
  assert.equal(deps.actor.items.get("stock").source.system.quantity, 0);
  const added = [...deps.actor.items.values()].find(item => item.id.startsWith("new"));
  assert.equal(added.source.system.quantity, 7);
  assert.deepEqual(added.source.effects, deps.template.source.effects);
  assert.deepEqual(added.source.flags["item-piles"], deps.template.source.flags["item-piles"]);
  assert.equal(deps.template.source.system.quantity, 4);
  deps.confirm = async () => assert.fail("Replay must not prompt");
  const before = deps.calls.length;
  assert.equal((await editMerchantInventory(request, deps)).replayed, true);
  assert.equal(deps.calls.length, before);
  await assert.rejects(editMerchantInventory({ ...request, add: [{ uuid: "Item.potion", quantity: 8 }] }, deps), /different/);
});

test("remove only the selected stock entry and tolerate missing removal IDs", async () => {
  const deps = fixture();
  const args = { uuid: request.uuid, requestId: "remove-stock-1", remove: ["stock", "missing"] };
  assert.equal((await editMerchantInventory(args, deps)).status, "updated");
  assert.equal(deps.actor.items.has("stock"), false);
  assert.equal(deps.actor.items.has("trait"), true);
});

test("cancel and changed merchant/source/session prevent all writes", async () => {
  for (const action of ["cancel", "merchant", "source", "gm", "connection", "quantityPath", "disabled"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (action === "merchant") {
        deps.actor.name = "Changed";
      } else if (action === "source") {
        deps.template.source.system.quantity = 9;
      } else if (action === "gm") {
        deps.game.user.isActiveGM = false;
      } else if (action === "connection") {
        deps.assertConnection = () => { throw new Error("Disconnected"); };
      } else if (action === "quantityPath") {
        deps.game.itempiles.API.ITEM_QUANTITY_ATTRIBUTE = "system.other";
      } else if (action === "disabled") {
        deps.game.modules.get("item-piles").active = false;
      }
      return action !== "cancel";
    };
    // Keep the injected connection callback live across the confirmation await.
    const options = { ...deps, assertConnection: () => deps.assertConnection?.() };
    if (action === "cancel") {
      assert.equal((await editMerchantInventory(request, options)).status, "cancelled");
    } else {
      await assert.rejects(editMerchantInventory(request, options));
    }
    assert.deepEqual(deps.calls, []);
  }
});

test("partial retries do not duplicate additions and report successful completion", async () => {
  const deps = fixture();
  deps.actor.fail = true;
  assert.equal((await editMerchantInventory(request, deps)).status, "incomplete");
  assert.equal(deps.calls.filter(call => call === "add").length, 1);
  deps.actor.fail = false;
  assert.equal((await editMerchantInventory(request, deps)).status, "updated");
  assert.equal(deps.calls.filter(call => call === "add").length, 1);
  assert.equal(deps.actor.items.get("stock").source.system.quantity, 0);
});

test("compendium additions preserve source data and require pack access", async () => {
  const deps = fixture();
  const args = { uuid: request.uuid, requestId: "compendium-stock-1", add: [{ uuid: "Compendium.gear.items.Item.potion", quantity: 2 }] };
  deps.game.items.clear();
  deps.template.pack = "gear.items";
  deps.game.packs.set("gear.items", { testUserPermission: () => false });
  await assert.rejects(editMerchantInventory(args, deps));
  assert.deepEqual(deps.calls, []);
  deps.game.packs.set("gear.items", { testUserPermission: () => true });
  assert.equal((await editMerchantInventory(args, deps)).status, "updated");
  const added = [...deps.actor.items.values()].find(item => item.id.startsWith("new"));
  assert.equal(added.source.system.quantity, 2);
  assert.deepEqual(added.source.effects, deps.template.source.effects);
});

test("a hook changing stock after an earlier write prevents stale deletion", async () => {
  const deps = fixture();
  const create = deps.actor.createEmbeddedDocuments;
  deps.actor.createEmbeddedDocuments = async (...args) => {
    const created = await create(...args);
    deps.actor.items.get("stock").source.system.quantity = 99;
    return created;
  };
  const args = { uuid: request.uuid, requestId: "hook-stock-1", add: request.add, remove: ["stock"] };
  const result = await editMerchantInventory(args, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(deps.actor.items.has("stock"), true);
  assert.equal(deps.calls.includes("remove"), false);
});

test("merchant magic stock uses the standalone merger and reviews the finished weapon", async () => {
  for (const stale of [false, true]) {
    const deps = fixture();
    const pack = "dnd-4e-compendium.module-equipment";
    const baseUuid = `Compendium.${pack}.Item.craghammer`;
    const enchantmentUuid = `Compendium.${pack}.Item.battering`;
    const base = { name: "Craghammer", type: "weapon", system: { quantity: 1, weaponBaseType: "craghammer",
      damageDice: { parts: [{ numDice: "1", numFaces: "10" }] }, properties: { bru: true }, brutalNum: 2 } };
    const enchantment = { name: "Battering Weapon +3", type: "weapon", system: { quantity: 1, level: 13, enhance: 3,
      price: 17000, description: { value: "Battering rules" }, damageCrit: { parts: [{ formula: "3d6", type: ["physical"] }] } } };
    const doc = (uuid, source) => ({ uuid, pack, documentName: "Item", testUserPermission: () => true,
      toObject: () => structuredClone(source) });
    const docs = new Map([[baseUuid, doc(baseUuid, base)], [enchantmentUuid, doc(enchantmentUuid, enchantment)]]);
    deps.game.packs.set(pack, { documentName: "Item", testUserPermission: () => true });
    deps.fromUuid = async uuid => docs.get(uuid);
    deps.confirm = async ({ changes }) => {
      assert.deepEqual(deps.calls, []);
      const data = changes[0].after;
      assert.equal(data.name, "Battering Craghammer +3");
      assert.equal(data.system.quantity, 5);
      assert.deepEqual(data.system.damageDice, base.system.damageDice);
      assert.deepEqual(data.system.damageCrit, enchantment.system.damageCrit);
      if (stale) {
        base.system.brutalNum = 99;
      }
      return true;
    };
    const args = { uuid: request.uuid, requestId: "magic-merchant-1", add: [{ uuid: enchantmentUuid, baseUuid, quantity: 5 }] };
    if (stale) {
      await assert.rejects(editMerchantInventory(args, deps), /sources changed/);
      assert.deepEqual(deps.calls, []);
    } else {
      assert.equal((await editMerchantInventory(args, deps)).status, "updated");
      assert.equal(deps.game.items.size, 1, "No temporary world Items are created");
      const added = [...deps.actor.items.values()].find(item => item.id.startsWith("new"));
      assert.equal(added.name, "Battering Craghammer +3");
      assert.equal(added.source.flags["foundry-mcp"].merchantAddition.baseUuid, baseUuid);
      assert.equal((await editMerchantInventory(args, deps)).replayed, true);
      assert.equal(deps.calls.filter(call => call === "add").length, 1);
    }
  }
});

test("reject unsupported actors, stock, source items and arbitrary caller input", async () => {
  for (const mutate of [
    deps => { deps.actor.type = "Player Character"; },
    deps => { deps.actor.parent = {}; },
    deps => { deps.game.itempiles.API.isItemPileMerchant = () => false; },
    deps => { deps.game.itempiles.API.ITEM_QUANTITY_ATTRIBUTE = "flags.secret"; },
    deps => { deps.template.source.type = "power"; },
    deps => { deps.template.testUserPermission = () => false; }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(editMerchantInventory(request, deps));
    assert.deepEqual(deps.calls, []);
  }
  for (const args of [
    { ...request, flags: {} }, { ...request, add: [{ uuid: "Actor.pc.Item.foo", quantity: 1 }] },
    { ...request, quantities: [{ id: "stock", quantity: -1 }] },
    { ...request, quantities: [{ id: "stock", quantity: 1.5 }] },
    { ...request, remove: ["stock"] }, { uuid: request.uuid, requestId: "empty-ops" }
  ]) {
    assert.throws(() => validateMerchantRequest(args, true));
  }
  const deps = fixture();
  await assert.rejects(editMerchantInventory({ uuid: request.uuid, requestId: "trait-removal", remove: ["trait"] }, deps));
});
