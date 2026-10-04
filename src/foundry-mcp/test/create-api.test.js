import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { createNpc } from "../scripts/create-api.js";
import { executeRead } from "../scripts/read-api.js";
import { MODULE_ID } from "../shared/protocol.js";

const troll = JSON.parse(await readFile(new URL("fixtures/shadow-troll.json", import.meta.url), "utf8"));

/**
 * Model the public Actor.create boundary without operating Foundry.
 */
function fixture() {
  const calls = [];
  const folderCalls = [];
  const game = {
    ready: true, socket: { connected: true }, user: { isGM: true, id: "gm" },
    world: { id: "world" }, system: { id: "dnd4e", version: "0.9.3" },
    settings: { get: () => true }, actors: new Map(),
    folders: new Map([["monsters", { id: "monsters", name: "Monsters", type: "Actor" }]])
  };
  const Actor = { create: async (data, options) => {
    calls.push({ data, options });
    const id = `npc${calls.length}`;
    const actor = {
      id, uuid: `Actor.${id}`, name: data.name, type: data.type,
      folder: game.folders.get(data.folder),
      getFlag: (module, key) => data.flags[module]?.[key],
      items: new Map(data.items.map((item, index) => [String(index), { ...item, id: String(index), uuid: `Actor.${id}.Item.${index}` }]))
    };
    game.actors.set(id, actor);
    return actor;
  } };
  const Folder = { create: async data => {
    folderCalls.push(data);
    const folder = { ...data, id: `folder${folderCalls.length}`, folder: game.folders.get(data.folder) ?? null };
    game.folders.set(folder.id, folder);
    return folder;
  } };
  return { game, Actor, Folder, crypto: webcrypto, calls, folderCalls };
}

test("creates the complete Shadow Troll and embedded powers in one call in the selected folder", async () => {
  const deps = fixture();
  const result = await createNpc(troll, deps);
  assert.equal(result.type, "NPC");
  assert.equal(result.folder, "monsters");
  assert.equal(result.items.length, 5);
  assert.equal(deps.calls.length, 1);
  const { data, options } = deps.calls[0];
  assert.equal(data.system.advancedCals, false);
  assert.equal(data.system.details.tier, 2);
  assert.deepEqual(data.prototypeToken, { name: "Shadow Troll", width: 2, height: 2, actorLink: false, disposition: -1 });
  assert.equal(options.renderSheet, false);
  assert.deepEqual(data.items, troll.items);
  assert.equal(data.flags[MODULE_ID].creationRequest.id, troll.requestId);
  assert.equal(data.system.attributes.hp.max / 2, 114);
});

test("same creation ID survives retry/reload; differing data and concurrent retries cannot duplicate NPCs", async () => {
  const deps = fixture();
  const [first, second] = await Promise.all([createNpc(troll, deps), createNpc(troll, deps)]);
  assert.equal(first.uuid, second.uuid);
  assert.equal(deps.calls.length, 1);
  // A fresh game wrapper represents the browser's in-flight state being lost.
  deps.game = { ...deps.game };
  const retry = await createNpc({ ...troll, system: { ...troll.system } }, deps);
  assert.equal(retry.reused, true);
  assert.equal(retry.uuid, first.uuid);
  await assert.rejects(createNpc({ ...troll, name: "Other" }, deps), /different NPC data/);
  assert.equal(deps.calls.length, 1);
  await createNpc({ ...troll, requestId: "intentional-second-copy" }, deps);
  assert.equal(deps.calls.length, 2);
});

test("requires an opted-in GM and supported system; a non-Actor or compendium folder ID is rejected", async () => {
  for (const change of [
    deps => { deps.game.user.isGM = false; },
    deps => { deps.game.settings.get = () => false; },
    deps => { deps.game.socket.connected = false; },
    deps => { deps.game.system.id = "dnd5e"; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.folders.get("monsters").type = "Item"; },
    deps => { deps.game.folders.get("monsters").pack = "pack"; }
  ]) {
    const deps = fixture();
    change(deps);
    await assert.rejects(createNpc({ ...troll, folder: "monsters" }, deps));
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.folderCalls.length, 0);
  }
});

test("rejects actor overrides, macros, effects, dotted fields and prototype keys even when bypassing MCP", async () => {
  const deps = fixture();
  const invalid = [
    { ...troll, type: "Player Character" }, { ...troll, _id: "existing" },
    { ...troll, flags: {} }, { ...troll, effects: [] }, { ...troll, folder: undefined },
    { ...troll, system: { "details.level": 12 } },
    { ...troll, system: { controller: "Actor.other" } },
    { ...troll, system: JSON.parse('{"__proto__":{"polluted":true}}') },
    { ...troll, system: { details: { level: NaN } } },
    { ...troll, items: [{ name: "Power", type: "power", system: { macro: { command: "evil()" } } }] },
    { ...troll, items: [{ name: "Power", type: "power", system: {}, effects: [] }] },
    { ...troll, items: [{ name: "Weapon", type: "weapon", system: {} }] }
  ];
  for (const args of invalid) {
    await assert.rejects(createNpc(args, deps));
  }
  assert.equal(deps.calls.length, 0);
  assert.equal({}.polluted, undefined);
  await assert.rejects(executeRead("create_npc_actor", troll, deps), /Unsupported read operation/);
});

test("revoked GM access during hashing prevents creation; revocation after creation preserves a retry receipt", async () => {
  const deps = fixture();
  deps.crypto = { subtle: { digest: async (...args) => {
    deps.game.user.isGM = false;
    return webcrypto.subtle.digest(...args);
  } } };
  await assert.rejects(createNpc(troll, deps), /GM session/);
  assert.equal(deps.calls.length, 0);
  deps.game.user.isGM = true;
  deps.crypto = webcrypto;
  const create = deps.Actor.create;
  deps.Actor.create = async (...args) => {
    const actor = await create(...args);
    deps.game.user.isGM = false;
    return actor;
  };
  await assert.rejects(createNpc(troll, deps), /GM session/);
  deps.game.user.isGM = true;
  assert.equal((await createNpc(troll, deps)).reused, true);
  assert.equal(deps.calls.length, 1);
});

test("cancelled creation releases the request for retry without a partial receipt", async () => {
  const deps = fixture();
  const create = deps.Actor.create;
  deps.Actor.create = async () => undefined;
  await assert.rejects(createNpc(troll, deps), /cancelled/);
  deps.Actor.create = create;
  assert.equal((await createNpc(troll, deps)).reused, false);
});

test("explicit folder names, full paths and IDs select the correct Actor folder", async () => {
  for (const selector of ["Trolls", "Monsters/Trolls", "trolls", " Monsters/Trolls "]) {
    const deps = fixture();
    const parent = deps.game.folders.get("monsters");
    deps.game.folders.set("trolls", { id: "trolls", name: "Trolls", type: "Actor", folder: parent });
    deps.game.folders.set("item-trolls", { id: "item-trolls", name: "Trolls", type: "Item" });
    const result = await createNpc({ ...troll, folder: selector }, deps);
    assert.equal(result.folder, "trolls");
    assert.equal(deps.calls[0].data.folder, "trolls");
  }
});

test("missing or ambiguous folder arguments never fall back to a guessed destination", async () => {
  const deps = fixture();
  deps.game.folders.set("other-monsters", { id: "other-monsters", name: "Monsters", type: "Actor" });
  await assert.rejects(createNpc(troll, deps), /ambiguous/);
  for (const folder of [undefined, "", "   "]) {
    await assert.rejects(createNpc({ ...troll, folder }, deps));
  }
  assert.equal(deps.calls.length, 0);
  assert.equal((await createNpc({ ...troll, folder: "monsters" }, deps)).folder, "monsters");
});

test("creates missing parent folders and places the NPC into the final destination", async () => {
  const deps = fixture();
  deps.game.folders.clear();
  const args = { ...troll, folder: "Monsters/Trolls" };
  const result = await createNpc(args, deps);
  assert.deepEqual(deps.folderCalls, [
    { name: "Monsters", type: "Actor", folder: null },
    { name: "Trolls", type: "Actor", folder: "folder1" }
  ]);
  assert.equal(result.folder, "folder2");
  assert.equal(deps.calls[0].data.folder, "folder2");
  assert.equal((await createNpc(args, deps)).reused, true);
  assert.equal(deps.folderCalls.length, 2);
});

test("concurrent NPC creations share new folders and reuse existing parents", async () => {
  const deps = fixture();
  const [first, second] = await Promise.all([
    createNpc({ ...troll, folder: "Monsters/Trolls" }, deps),
    createNpc({ ...troll, folder: "Monsters/Trolls", requestId: "second-troll-in-folder" }, deps)
  ]);
  assert.equal(first.folder, second.folder);
  assert.deepEqual(deps.folderCalls, [{ name: "Trolls", type: "Actor", folder: "monsters" }]);
  assert.equal(deps.calls.length, 2);
});

test("folder creation cancellation or loss of GM access stops before creating an NPC", async () => {
  const deps = fixture();
  deps.Folder.create = async () => undefined;
  await assert.rejects(createNpc({ ...troll, folder: "New Folder" }, deps), /cancelled/);
  assert.equal(deps.calls.length, 0);
  const second = fixture();
  const create = second.Folder.create;
  second.Folder.create = async data => {
    const folder = await create(data);
    second.game.user.isGM = false;
    return folder;
  };
  await assert.rejects(createNpc({ ...troll, folder: "New Parent/Child" }, second), /GM session/);
  assert.equal(second.folderCalls.length, 1);
  assert.equal(second.calls.length, 0);
});
