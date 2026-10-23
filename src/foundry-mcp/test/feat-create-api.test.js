import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createFeat } from "../scripts/feat-create-api.js";
import { DEFAULT_FEAT_IMAGE } from "../shared/feat-data.js";

const args = { requestId: "authored-feat-test", name: "Steady Aim", level: 4,
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
    const id = `feat${calls.length}`;
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

test("creates a world feat with level, separate flavor/rules content and default notebook image", async () => {
  const deps = fixture();
  const result = await createFeat(args, deps);
  assert.equal(result.uuid, "Item.feat1");
  assert.equal(result.level, 4);
  assert.equal(result.img, DEFAULT_FEAT_IMAGE);
  assert.equal(result.actorUuid, null);
  assert.equal(deps.folderCalls[0].name, "Feats");
  const { data, options } = deps.calls[0];
  assert.equal(data.type, "feature");
  assert.deepEqual(data.system, { featureType: "feat", level: 4,
    description: { chat: args.text, value: args.description } });
  assert.equal(options.renderSheet, false);
  assert.equal(data.effects, undefined);
});

test("creates a feat directly on a PC without a world Item or folder", async () => {
  const deps = fixture();
  const result = await createFeat({ ...args, actorUuid: "Actor.hero" }, deps);
  assert.equal(result.uuid, "Actor.hero.Item.feat1");
  assert.equal(result.actorUuid, "Actor.hero");
  assert.equal(result.folder, null);
  assert.equal(deps.game.items.size, 0);
  assert.equal(deps.game.actors.get("hero").items.size, 1);
  assert.equal(deps.folderCalls.length, 0);
  assert.equal(deps.calls[0].data.folder, undefined);
});

test("creates unlevelled PC traits and distinguishes their retry identity from feats", async () => {
  const deps = fixture();
  const trait = { ...args, name: "Orc Resilience", featureType: "trait", level: null, actorUuid: "Actor.hero" };
  const result = await createFeat(trait, deps);
  assert.equal(result.featureType, "trait");
  assert.equal(result.level, null);
  assert.equal(deps.calls[0].data.system.featureType, "trait");
  assert.equal(deps.game.items.size, 0);
  assert.equal((await createFeat(trait, deps)).reused, true);
  await assert.rejects(createFeat({ ...trait, featureType: "feat", level: 1 }, deps), /different feat data/);
});

test("default and explicit feat types reuse the same persisted receipt", async () => {
  const deps = fixture();
  const first = await createFeat(args, deps);
  const retry = await createFeat({ ...args, featureType: "feat" }, deps);
  assert.equal(retry.uuid, first.uuid);
  assert.equal(retry.reused, true);
});

test("creates levelled Theme Features on PCs and in world folders with safe retries", async () => {
  for (const target of [{}, { actorUuid: "Actor.hero" }]) {
    const deps = fixture();
    const input = { ...args, ...target, name: "Mechanical Pet", level: 5, featureType: "theme" };
    const first = await createFeat(input, deps);
    assert.equal(first.featureType, "theme");
    assert.equal(first.level, 5);
    assert.equal(deps.calls[0].data.system.featureType, "theme");
    assert.equal(deps.calls[0].data.effects, undefined);
    if (target.actorUuid) {
      assert.equal(deps.game.items.size, 0);
      assert.equal(deps.folderCalls.length, 0);
    } else {
      assert.equal(deps.folderCalls[0].name, "Theme Features");
    }
    assert.equal((await createFeat(input, deps)).reused, true);
    await assert.rejects(createFeat({ ...input, featureType: "feat" }, deps), /different feat data/);
    assert.equal(deps.calls.length, 1);
  }
});

test("accepts empty flavor and an explicit nested Item folder with the fixed notebook image", async () => {
  const deps = fixture();
  const result = await createFeat({ ...args, text: "", folder: "Campaign/Feats" }, deps);
  assert.equal(result.img, DEFAULT_FEAT_IMAGE);
  assert.equal(deps.calls[0].data.system.description.chat, "");
  assert.deepEqual(deps.folderCalls.map(folder => [folder.name, folder.type]), [["Campaign", "Item"], ["Feats", "Item"]]);
});

test("concurrent and persisted retries reuse world and embedded feats; changed data/destinations are rejected", async () => {
  for (const target of [{}, { actorUuid: "Actor.hero" }]) {
    const deps = fixture();
    const input = { ...args, ...target };
    const [first, second] = await Promise.all([createFeat(input, deps), createFeat(input, deps)]);
    assert.equal(first.uuid, second.uuid);
    assert.equal(deps.calls.length, 1);
    deps.game = { ...deps.game };
    const again = await createFeat(input, deps);
    assert.equal(again.uuid, first.uuid);
    assert.equal(again.reused, true);
    await assert.rejects(createFeat({ ...input, level: 5 }, deps), /different feat data/);
    await assert.rejects(createFeat({ ...input, actorUuid: "Actor.other" }, deps), /different feat data/);
    if (target.actorUuid) {
      await assert.rejects(createFeat(args, deps), /different feat data/);
    }
    assert.equal(deps.calls.length, 1);
  }
});

test("validates the authored feat boundary without relying on MCP schema", async () => {
  for (const input of [
    { ...args, requestId: "short" }, { ...args, name: " " },
    { ...args, level: 0 }, { ...args, level: 31 }, { ...args, level: 1.5 },
    { ...args, level: null }, { ...args, featureType: "race" },
    { ...args, featureType: "theme", level: null },
    { ...args, text: undefined }, { ...args, description: undefined },
    { ...args, actorUuid: "Scene.scene.Token.token.Actor.hero" },
    { ...args, actorUuid: "Actor.hero", folder: "Feats" },
    { ...args, folder: " " }, { ...args, img: "icons/custom.webp" },
    { ...args, system: {} }, { ...args, effects: [] }, { ...args, flags: {} },
    { ...args, text: "x".repeat(50001) }
  ]) {
    const deps = fixture();
    await assert.rejects(createFeat(input, deps));
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
    await assert.rejects(createFeat({ ...args, actorUuid: "Actor.hero" }, deps));
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
  await assert.rejects(createFeat(args, hashing));
  assert.equal(hashing.calls.length, 0);
  const folder = fixture();
  const createFolder = folder.Folder.create;
  folder.Folder.create = async data => {
    const saved = await createFolder(data);
    folder.game.user.isGM = false;
    return saved;
  };
  await assert.rejects(createFeat(args, folder));
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
    await assert.rejects(createFeat({ ...args, ...target }, deps), /Disconnected/);
    connected = true;
    assert.equal((await createFeat({ ...args, ...target }, deps)).reused, true);
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
    await assert.rejects(createFeat({ ...args, ...target }, deps), /cancelled/);
    owner[method] = create;
    assert.equal((await createFeat({ ...args, ...target }, deps)).reused, false);
    assert.equal(deps.calls.length, 1);
  }
});
