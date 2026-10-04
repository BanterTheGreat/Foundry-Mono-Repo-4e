import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { createItem } from "../scripts/item-create-api.js";
import { createNpc } from "../scripts/create-api.js";
import { MODULE_ID } from "../shared/protocol.js";

const hammer = JSON.parse(await readFile(new URL("fixtures/hammer-of-the-lost-riders.json", import.meta.url), "utf8"));

/**
 * Model world Item and Folder creation without operating Foundry.
 */
function fixture() {
  const calls = [];
  const folderCalls = [];
  const game = {
    ready: true, socket: { connected: true }, user: { isGM: true, id: "gm" },
    world: { id: "world" }, system: { id: "dnd4e", version: "0.9.3" },
    settings: { get: () => true }, items: new Map(), actors: new Map(),
    folders: new Map([["magic", { id: "magic", name: "Magic Items", type: "Item" }]])
  };
  const Item = { create: async (data, options) => {
    calls.push({ data, options });
    const id = `item${calls.length}`;
    const item = {
      id, uuid: `Item.${id}`, name: data.name, type: data.type,
      folder: game.folders.get(data.folder), getFlag: (module, key) => data.flags[module]?.[key]
    };
    game.items.set(id, item);
    return item;
  } };
  const Folder = { create: async data => {
    folderCalls.push(data);
    const folder = { ...data, id: `folder${folderCalls.length}`, folder: game.folders.get(data.folder) ?? null };
    game.folders.set(folder.id, folder);
    return folder;
  } };
  return { game, Item, Folder, crypto: webcrypto, calls, folderCalls };
}

test("creates the level 16 +4 rare warhammer in the chosen world Item folder", async () => {
  const deps = fixture();
  const result = await createItem(hammer, deps);
  assert.equal(result.uuid, "Item.item1");
  assert.equal(result.type, "weapon");
  assert.equal(result.folder, "magic");
  assert.equal(deps.calls.length, 1);
  const { data, options } = deps.calls[0];
  assert.deepEqual(data.system, hammer.system);
  assert.equal(data.system.level, 16);
  assert.equal(data.system.enhance, 4);
  assert.equal(data.system.price, 45000);
  assert.equal(data.system.weaponBaseType, "warhammer");
  assert.equal(data.system.critDamageForm, "0");
  assert.deepEqual(data.system.damageCrit.parts, [{ formula: "4d6", type: ["cold"] }]);
  assert.equal(data.flags[MODULE_ID].creationRequest.id, hammer.requestId);
  assert.equal(options.renderSheet, false);
  assert.equal(Object.hasOwn(data, "effects"), false);
});

test("concurrent retries and persisted receipts prevent duplicates, and changed payloads are rejected", async () => {
  const deps = fixture();
  const [first, second] = await Promise.all([createItem(hammer, deps), createItem(hammer, deps)]);
  assert.equal(first.uuid, second.uuid);
  assert.equal(deps.calls.length, 1);
  deps.game = { ...deps.game };
  const reordered = { system: hammer.system, folder: hammer.folder, type: hammer.type, name: hammer.name, requestId: hammer.requestId };
  const retry = await createItem(reordered, deps);
  assert.equal(retry.uuid, first.uuid);
  assert.equal(retry.reused, true);
  await assert.rejects(createItem({ ...hammer, system: { ...hammer.system, enhance: 5 } }, deps), /different Item data/);
  await createItem({ ...hammer, requestId: "intentional-second-hammer" }, deps);
  assert.equal(deps.calls.length, 2);
});

test("validates Item type and source fields even when bypassing MCP", async () => {
  const deps = fixture();
  for (const args of [
    { ...hammer, type: "Macro" }, { ...hammer, type: "constructor" },
    { ...hammer, _id: "existing" }, { ...hammer, parent: "Actor.npc" },
    { ...hammer, flags: {} }, { ...hammer, effects: [] },
    { ...hammer, system: { itemPowers: ["Item.other"] } },
    { ...hammer, system: { macros: [{ command: "evil()" }] } },
    { ...hammer, system: { "description.chat": "flavor" } },
    { ...hammer, system: JSON.parse('{"__proto__":{"polluted":true}}') },
    { ...hammer, system: { properties: { unknown: true } } },
    { ...hammer, system: { price: -1 } }, { ...hammer, system: { enhance: NaN } },
    { ...hammer, folder: "" }, { ...hammer, folder: undefined },
    { ...hammer, type: "feature", system: hammer.system }
  ]) {
    await assert.rejects(createItem(args, deps));
  }
  assert.equal(deps.calls.length, 0);
  assert.equal(deps.folderCalls.length, 0);
  assert.equal({}.polluted, undefined);
  for (const [type, system] of [
    ["equipment", { armour: { type: "armour", enhance: 4 } }],
    ["power", { description: { chat: "Flavor text" }, attack: { isAttack: false } }],
    ["feature", { featureType: "trait", description: { value: "Property" } }]
  ]) {
    assert.equal((await createItem({ ...hammer, type, system, requestId: `create-${type}-request` }, deps)).type, type);
  }
});

test("requires an enabled GM, pinned system, and a world Item folder", async () => {
  for (const change of [
    deps => { deps.game.user.isGM = false; }, deps => { deps.game.settings.get = () => false; },
    deps => { deps.game.socket.connected = false; }, deps => { deps.game.system.id = "dnd5e"; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.folders.get("magic").type = "Actor"; },
    deps => { deps.game.folders.get("magic").pack = "pack"; }
  ]) {
    const deps = fixture();
    change(deps);
    await assert.rejects(createItem({ ...hammer, folder: "magic" }, deps));
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.folderCalls.length, 0);
  }
});

test("folder names, paths and IDs resolve only Item folders; missing paths are shared across requests", async () => {
  for (const folder of ["Magic Items", "magic"]) {
    const deps = fixture();
    deps.game.folders.set("actor", { id: "actor", name: "Magic Items", type: "Actor" });
    assert.equal((await createItem({ ...hammer, folder }, deps)).folder, "magic");
  }
  const deps = fixture();
  const [first, second] = await Promise.all([
    createItem({ ...hammer, folder: "Magic Items/Weapons" }, deps),
    createItem({ ...hammer, folder: "Magic Items/Weapons", requestId: "another-folder-hammer" }, deps)
  ]);
  assert.equal(first.folder, second.folder);
  assert.deepEqual(deps.folderCalls, [{ name: "Weapons", type: "Item", folder: "magic" }]);
  deps.game.folders.set("other", { id: "other", name: "Magic Items", type: "Item" });
  await assert.rejects(createItem({ ...hammer, requestId: "ambiguous-hammer-request" }, deps), /ambiguous/);
  for (const folder of ["/Bad", "Bad//Path"]) {
    await assert.rejects(createItem({ ...hammer, folder, requestId: "invalid-path-request" }, deps), /non-empty/);
  }
});

test("Actor and Item folder creation remain separate even with concurrent matching paths", async () => {
  const deps = fixture();
  const Actor = { create: async data => ({
    id: "npc", uuid: "Actor.npc", name: data.name, type: data.type,
    folder: deps.game.folders.get(data.folder), items: new Map()
  }) };
  const [item, npc] = await Promise.all([
    createItem({ ...hammer, folder: "Shared/Child" }, deps),
    createNpc({ name: "NPC", folder: "Shared/Child", requestId: "shared-folder-npc", system: {} }, { ...deps, Actor })
  ]);
  assert.notEqual(item.folder, npc.folder);
  assert.equal(deps.game.folders.get(item.folder).type, "Item");
  assert.equal(deps.game.folders.get(npc.folder).type, "Actor");
  assert.equal(deps.folderCalls.length, 4);
});

test("revoked access stops creation and a post-save disconnect can be retried safely", async () => {
  const deps = fixture();
  deps.crypto = { subtle: { digest: async (...args) => {
    deps.game.user.isGM = false;
    return webcrypto.subtle.digest(...args);
  } } };
  await assert.rejects(createItem(hammer, deps), /GM session/);
  assert.equal(deps.calls.length, 0);
  const folderDeps = fixture();
  const createFolder = folderDeps.Folder.create;
  folderDeps.Folder.create = async data => {
    const folder = await createFolder(data);
    folderDeps.game.world.id = "changed";
    return folder;
  };
  await assert.rejects(createItem({ ...hammer, folder: "New/Child" }, folderDeps), /GM session/);
  assert.equal(folderDeps.calls.length, 0);
  assert.equal(folderDeps.folderCalls.length, 1);
  const savedDeps = fixture();
  const create = savedDeps.Item.create;
  savedDeps.Item.create = async (...args) => {
    const item = await create(...args);
    savedDeps.game.socket.connected = false;
    return item;
  };
  await assert.rejects(createItem(hammer, savedDeps), /GM session/);
  savedDeps.game.socket.connected = true;
  assert.equal((await createItem(hammer, savedDeps)).reused, true);
  assert.equal(savedDeps.calls.length, 1);
});

test("cancelled Item or folder creation releases the request for retry", async () => {
  const deps = fixture();
  const create = deps.Item.create;
  deps.Item.create = async () => undefined;
  await assert.rejects(createItem(hammer, deps), /cancelled/);
  deps.Item.create = create;
  assert.equal((await createItem(hammer, deps)).reused, false);
  const other = fixture();
  other.Folder.create = async () => undefined;
  await assert.rejects(createItem({ ...hammer, folder: "New" }, other), /cancelled/);
  assert.equal(other.calls.length, 0);
});

test("rejects oversized Item payloads before creating folders or documents", async () => {
  const deps = fixture();
  const system = { damage: { parts: Array.from({ length: 45 }, () => ({ formula: "x".repeat(50000), type: ["cold"] })) } };
  await assert.rejects(createItem({ ...hammer, system }, deps), /2 MiB/);
  assert.equal(deps.calls.length, 0);
  assert.equal(deps.folderCalls.length, 0);
});
