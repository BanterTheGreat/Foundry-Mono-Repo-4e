import test from "node:test";
import assert from "node:assert/strict";
import { executeRead } from "../scripts/read-api.js";

/**
 * Model only Foundry's public document reads; writes deliberately throw.
 */
function document(id, name, documentName = "Actor", data = {}) {
  return {
    id, name, documentName, uuid: `${documentName}.${id}`,
    testUserPermission: () => true,
    toObject: source => ({ _id: id, name, system: { hp: source ? 10 : 15 }, ...data }),
    update: () => { throw new Error("A write was attempted."); }
  };
}

/**
 * Create a minimal opted-in GM world without launching Foundry.
 */
function fixture() {
  const actor = document("abc", "Goblin", "Actor", { items: [{ name: "Sword" }], effects: [] });
  const game = {
    ready: true, socket: { connected: true }, user: { isGM: true, id: "gm" },
    settings: { get: () => true }, packs: new Map(),
    collections: new Map([["Actor", new Map([[actor.id, actor]])]])
  };
  return { game, fromUuid: async () => actor, actor };
}

test("reads prepared/source DnD4e data and projects serialized fields", async () => {
  const deps = fixture();
  const prepared = await executeRead("get_document", { uuid: "Actor.abc", fields: ["system.hp", "items"] }, deps);
  assert.deepEqual(prepared.data, { "system.hp": 15, items: [{ name: "Sword" }] });
  const source = await executeRead("get_document", { uuid: "Actor.abc", source: true }, deps);
  assert.equal(source.data.system.hp, 10);
});

test("world discovery filters names and provides bounded pagination", async () => {
  const deps = fixture();
  deps.game.collections.get("Actor").set("def", document("def", "Goblin Archer"));
  const result = await executeRead("list_documents", { documentType: "Actor", query: "GOBLIN", limit: 1 }, deps);
  assert.equal(result.total, 2);
  assert.equal(result.nextOffset, 1);
  assert.equal(result.entries[0].uuid, "Actor.abc");
  await assert.rejects(executeRead("list_documents", { documentType: "Actor", limit: 101 }, deps));
});

test("write/eval operations and settings traversal are rejected", async () => {
  const deps = fixture();
  for (const operation of ["update_document", "delete_document", "execute_macro", "eval"]) {
    await assert.rejects(executeRead(operation, {}, deps), /Unsupported read operation/);
  }
  await assert.rejects(executeRead("get_document", { uuid: "Setting.secret" }, deps));
  await assert.rejects(executeRead("get_document", { uuid: "Actor.abc", fields: ["__proto__.x"] }, deps));
  await assert.rejects(executeRead("get_document", { uuid: "Actor.abc.update.x" }, deps));
});

test("player sessions and disabled bridges cannot read", async () => {
  const deps = fixture();
  deps.game.user.isGM = false;
  await assert.rejects(executeRead("list_documents", { documentType: "Actor" }, deps), /GM session/);
  deps.game.user.isGM = true;
  deps.game.settings.get = () => false;
  await assert.rejects(executeRead("get_document", { uuid: "Actor.abc" }, deps), /GM session/);
});

test("GM access revoked during an awaited read fails closed", async () => {
  const deps = fixture();
  deps.fromUuid = async () => {
    deps.game.user.isGM = false;
    return deps.actor;
  };
  await assert.rejects(executeRead("get_document", { uuid: "Actor.abc" }, deps), /GM session/);
});

test("a GM tab disconnected from Foundry cannot serve cached world data", async () => {
  const deps = fixture();
  deps.game.socket.connected = false;
  await assert.rejects(executeRead("list_documents", { documentType: "Actor" }, deps), /GM session/);
});

test("permissions are checked on embedded parents and compendiums", async () => {
  const deps = fixture();
  deps.actor.parent = { testUserPermission: () => false };
  await assert.rejects(executeRead("get_document", { uuid: "Actor.abc.Item.item" }, deps), /access denied/);
  let resolved = false;
  deps.fromUuid = async () => { resolved = true; return deps.actor; };
  await assert.rejects(executeRead("get_document", { uuid: "Compendium.dnd4e.powers.Item.abc" }, deps), /access denied/);
  assert.equal(resolved, false);
});

test("user documents never expose password, flags, or arbitrary serialization", async () => {
  const deps = fixture();
  deps.fromUuid = async () => ({
    ...document("gm", "Gamemaster", "User"), role: 4, isGM: true,
    password: "private", passwordSalt: "private", flags: { token: "private" },
    toObject: () => { throw new Error("User serialization should use a safe field list."); }
  });
  const result = await executeRead("get_document", { uuid: "User.gm" }, deps);
  assert.equal(result.data.name, "Gamemaster");
  assert.equal(Object.hasOwn(result.data, "password"), false);
  assert.equal(Object.hasOwn(result.data, "flags"), false);
});

test("compendium discovery reads an index without importing documents", async () => {
  const deps = fixture();
  deps.game.packs.set("dnd4e.powers", {
    collection: "dnd4e.powers", title: "Powers", documentName: "Item", locked: true,
    testUserPermission: () => true,
    getIndex: async () => new Map([["power", { _id: "power", name: "Cleave", type: "power" }]]),
    getUuid: id => `Compendium.dnd4e.powers.Item.${id}`
  });
  const packs = await executeRead("list_compendiums", {}, deps);
  assert.equal(packs.entries[0].id, "dnd4e.powers");
  const entries = await executeRead("list_compendium_documents", { pack: "dnd4e.powers" }, deps);
  assert.equal(entries.entries[0].uuid, "Compendium.dnd4e.powers.Item.power");
});
