import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createRitual } from "../scripts/ritual-create-api.js";
import { DEFAULT_RITUAL_IMAGE } from "../shared/ritual-data.js";

const args = { requestId: "authored-ritual-test", name: "Steady Aim", level: 4,
  text: "A moment of focus.", description: "<p>Gain the described benefit.</p>" };

/**
 * Model world and embedded creation, including persisted receipts and revocation.
 */
function fixture() {
  const calls = [];
  const folderCalls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    world: { id: "world" }, user: { id: "gm", isGM: true, isActiveGM: true },
    system: { id: "dnd4e", version: "0.9.3" }, items: new Map(), actors: new Map(), folders: new Map()
  };
  const save = (data, parent, options) => {
    calls.push({ data: structuredClone(data), parent, options });
    const id = `ritual${calls.length}`;
    const item = { ...data, id, parent, folder: game.folders.get(data.folder) ?? null,
      uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`,
      getFlag: (module, key) => data.flags?.[module]?.[key] };
    (parent?.items ?? game.items).set(id, item);
    return item;
  };
  for (const id of ["hero", "other"]) {
    const actor = { id, uuid: `Actor.${id}`, type: "Player Character", items: new Map(),
      createEmbeddedDocuments: async (type, data, options) => data.map(item => save(item, actor, options)) };
    game.actors.set(id, actor);
  }
  const Item = { create: async (data, options) => save(data, null, options) };
  const Folder = { create: async data => {
    folderCalls.push(data);
    const folder = { ...data, id: `folder${folderCalls.length}`, folder: game.folders.get(data.folder) ?? null };
    game.folders.set(folder.id, folder);
    return folder;
  } };
  return { game, Item, Folder, calls, folderCalls, crypto: webcrypto };
}

test("creates a world ritual with level, separate flavor/rules content and default notebook image", async () => {
  const deps = fixture();
  const result = await createRitual(args, deps);
  assert.equal(result.uuid, "Item.ritual1");
  assert.equal(result.level, 4);
  assert.equal(result.img, DEFAULT_RITUAL_IMAGE);
  assert.equal(result.actorUuid, null);
  assert.equal(deps.folderCalls[0].name, "Rituals");
  const { data, options } = deps.calls[0];
  assert.equal(data.type, "ritual");
  assert.deepEqual(data.system, { level: 4,
    description: { chat: args.text, value: args.description } });
  assert.equal(options.renderSheet, false);
  assert.equal(data.effects, undefined);
});

test("creates a ritual directly on a PC without a world Item or folder", async () => {
  const deps = fixture();
  const result = await createRitual({ ...args, actorUuid: "Actor.hero" }, deps);
  assert.equal(result.uuid, "Actor.hero.Item.ritual1");
  assert.equal(result.actorUuid, "Actor.hero");
  assert.equal(result.folder, null);
  assert.equal(deps.game.items.size, 0);
  assert.equal(deps.game.actors.get("hero").items.size, 1);
  assert.equal(deps.folderCalls.length, 0);
  assert.equal(deps.calls[0].data.folder, undefined);
});

test("accepts empty flavor and an explicit nested Item folder with the fixed notebook image", async () => {
  const deps = fixture();
  const result = await createRitual({ ...args, text: "", folder: "Campaign/Rituals" }, deps);
  assert.equal(result.img, DEFAULT_RITUAL_IMAGE);
  assert.equal(deps.calls[0].data.system.description.chat, "");
  assert.deepEqual(deps.folderCalls.map(folder => [folder.name, folder.type]), [["Campaign", "Item"], ["Rituals", "Item"]]);
});

test("concurrent and persisted retries reuse world and embedded rituals; changed data/destinations are rejected", async () => {
  for (const target of [{}, { actorUuid: "Actor.hero" }]) {
    const deps = fixture();
    const input = { ...args, ...target };
    const [first, second] = await Promise.all([createRitual(input, deps), createRitual(input, deps)]);
    assert.equal(first.uuid, second.uuid);
    assert.equal(deps.calls.length, 1);
    deps.game = { ...deps.game };
    const again = await createRitual(input, deps);
    assert.equal(again.uuid, first.uuid);
    assert.equal(again.reused, true);
    await assert.rejects(createRitual({ ...input, level: 5 }, deps), /different ritual data/);
    await assert.rejects(createRitual({ ...input, actorUuid: "Actor.other" }, deps), /different ritual data/);
    if (target.actorUuid) {
      await assert.rejects(createRitual(args, deps), /different ritual data/);
    }
    assert.equal(deps.calls.length, 1);
  }
});

test("validates the authored ritual boundary without relying on MCP schema", async () => {
  for (const input of [
    { ...args, requestId: "short" }, { ...args, name: " " },
    { ...args, level: 0 }, { ...args, level: 31 }, { ...args, level: 1.5 },
    { ...args, level: null }, { ...args, ritualureType: "race" },
    { ...args, ritualureType: "theme", level: null },
    { ...args, text: undefined }, { ...args, description: undefined },
    { ...args, actorUuid: "Scene.scene.Token.token.Actor.hero" },
    { ...args, actorUuid: "Actor.hero", folder: "Rituals" },
    { ...args, folder: " " }, { ...args, img: "icons/custom.webp" },
    { ...args, system: {} }, { ...args, effects: [] }, { ...args, flags: {} },
    { ...args, text: "x".repeat(50001) }
  ]) {
    const deps = fixture();
    await assert.rejects(createRitual(input, deps));
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.folderCalls.length, 0);
  }
});

test("rejects NPCs, token actors, compendiums, absent PCs and unsupported sessions", async () => {
  for (const mutate of [
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.user.isGM = false; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.actors.get("hero").type = "NPC"; },
    deps => { deps.game.actors.get("hero").parent = {}; },
    deps => { deps.game.actors.get("hero").pack = "pack"; },
    deps => { deps.game.actors.delete("hero"); }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(createRitual({ ...args, actorUuid: "Actor.hero" }, deps));
    assert.equal(deps.calls.length, 0);
  }
});

test("revoked session during hashing/folder creation stops writes; post-save disconnect supports retry", async () => {
  const hashing = fixture();
  hashing.crypto = { subtle: { digest: async (...input) => {
    const digest = await webcrypto.subtle.digest(...input);
    hashing.game.user.isGM = false;
    return digest;
  } } };
  await assert.rejects(createRitual(args, hashing));
  assert.equal(hashing.calls.length, 0);
  const folder = fixture();
  const createFolder = folder.Folder.create;
  folder.Folder.create = async data => {
    const saved = await createFolder(data);
    folder.game.user.isGM = false;
    return saved;
  };
  await assert.rejects(createRitual(args, folder));
  assert.equal(folder.calls.length, 0);
  for (const target of [{}, { actorUuid: "Actor.hero" }]) {
    const deps = fixture();
    let connected = true;
    const create = target.actorUuid ? deps.game.actors.get("hero").createEmbeddedDocuments : deps.Item.create;
    const save = async (...input) => {
      const result = await create(...input);
      connected = false;
      return result;
    };
    if (target.actorUuid) {
      deps.game.actors.get("hero").createEmbeddedDocuments = save;
    } else {
      deps.Item.create = save;
    }
    deps.assertConnection = () => { if (!connected) { throw new Error("Disconnected"); } };
    await assert.rejects(createRitual({ ...args, ...target }, deps), /Disconnected/);
    connected = true;
    assert.equal((await createRitual({ ...args, ...target }, deps)).reused, true);
    assert.equal(deps.calls.length, 1);
  }
});

test("cancelled world or embedded creation does not claim success and can be retried", async () => {
  for (const target of [{}, { actorUuid: "Actor.hero" }]) {
    const deps = fixture();
    const owner = target.actorUuid ? deps.game.actors.get("hero") : deps.Item;
    const method = target.actorUuid ? "createEmbeddedDocuments" : "create";
    const create = owner[method];
    owner[method] = async () => target.actorUuid ? [] : null;
    await assert.rejects(createRitual({ ...args, ...target }, deps), /cancelled/);
    owner[method] = create;
    assert.equal((await createRitual({ ...args, ...target }, deps)).reused, false);
    assert.equal(deps.calls.length, 1);
  }
});
