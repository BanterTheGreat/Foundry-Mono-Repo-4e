import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { setupPc } from "../scripts/pc-setup-api.js";
import { CORE_PC_POWERS } from "../shared/pc-setup-data.js";

const args = { requestId: "setup-pc-test", name: "Aria", race: "Human", class: "Fighter" };

/**
 * Simulate source packs and Actor creation without operating Foundry.
 */
function fixture() {
  const calls = [];
  const folderCalls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), packs: new Map(), folders: new Map()
  };
  for (const [label, names, type, packageName] of [
    ["Classes", ["Fighter"], "feature", "dnd-4e-compendium"],
    ["Powers (Core)", CORE_PC_POWERS, "power", "dnd4e"]
  ]) {
    const collection = `${packageName}.${type}`;
    const pack = {
      collection, documentName: "Item", metadata: { label, packageName }, testUserPermission: () => true,
      rows: new Map(names.map((name, index) => [String(index), { _id: String(index), name }])),
      getIndex: async () => pack.rows,
      getDocument: async id => ({ type, system: { featureType: "class" }, uuid: `Compendium.${collection}.Item.${id}`,
        toObject: () => ({ _id: id, name: pack.rows.get(id).name, type, folder: "source-folder", ownership: {},
          system: { featureType: "class", description: { value: "Native rules" } },
          effects: [{ name: "Native effect" }], flags: { automation: { enabled: true } } }) })
    };
    game.packs.set(collection, pack);
  }
  const Actor = { create: async (data, options) => {
    calls.push({ data, options });
    const id = `pc${calls.length}`;
    const actor = { ...data, id, uuid: `Actor.${id}`, folder: game.folders.get(data.folder),
      getFlag: (module, key) => data.flags?.[module]?.[key],
      items: new Map(data.items.map((source, index) => [String(index), {
        ...source, uuid: `Actor.${id}.Item.${index}`, getFlag: (module, key) => source.flags?.[module]?.[key]
      }])) };
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

test("creates a PC with the requested identity, enabled formula bonuses, layout, auto HP and six native Items", async () => {
  const deps = fixture();
  const result = await setupPc(args, deps);
  assert.equal(result.status, "complete");
  assert.equal(result.type, "Player Character");
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.folderCalls[0].name, "Player Characters");
  const { data, options } = deps.calls[0];
  assert.equal(data.name, "Aria");
  assert.deepEqual(data.system.details, { race: "Human", class: "Fighter" });
  for (const bonus of [data.system.modifiers.attack.bonus, ...Object.values(data.system.defences).map(defence => defence.bonus)]) {
    assert.deepEqual(bonus, [{ name: "Tier", value: "@tier", active: true, note: "" }]);
  }
  assert.equal(data.system.defences.ac, undefined);
  assert.equal(data.system.powerGroupTypes, "actionMod");
  assert.equal(data.system.powerSortTypes, "useType");
  assert.equal(data.system.attributes.hp.autototal, true);
  assert.equal(data.prototypeToken.actorLink, true);
  assert.equal(options.renderSheet, false);
  assert.deepEqual(data.items.map(item => item.name), ["Fighter", ...CORE_PC_POWERS]);
  for (const item of data.items) {
    assert.equal(item._id, undefined);
    assert.equal(item.folder, undefined);
    assert.equal(item.effects[0].name, "Native effect");
    assert.equal(item.flags.automation.enabled, true);
    assert.match(item.flags.core.sourceId, /^Compendium\./);
  }
});

test("concurrent and persisted retries reuse the actor; changed input under the same request is rejected", async () => {
  const deps = fixture();
  const [first, second] = await Promise.all([setupPc(args, deps), setupPc(args, deps)]);
  assert.equal(first.uuid, second.uuid);
  assert.equal(deps.calls.length, 1);
  deps.game = { ...deps.game };
  const reused = await setupPc(args, deps);
  assert.equal(reused.reused, true);
  assert.equal(reused.uuid, first.uuid);
  await assert.rejects(setupPc({ ...args, race: "Elf" }, deps), /different PC setup data/);
  assert.equal(deps.calls.length, 1);
  deps.game.actors.get("pc1").items.delete("0");
  assert.equal((await setupPc(args, deps)).status, "incomplete");
  assert.equal(deps.calls.length, 1);
});

test("uses the Powers (Core) Charge Attack entry for the requested Charge action", async () => {
  const deps = fixture();
  const pack = deps.game.packs.get("dnd4e.power");
  const charge = Array.from(pack.rows.values()).find(row => row.name === "Charge");
  charge.name = "Charge Attack";
  const result = await setupPc(args, deps);
  assert.equal(result.status, "complete");
  assert.ok(result.items.some(item => item.name === "Charge Attack"));
  assert.equal(deps.calls[0].data.items.length, 6);
});

test("missing or ambiguous packs or entries create neither actors nor folders", async () => {
  for (const mutate of [
    deps => deps.game.packs.delete("dnd4e.power"),
    deps => { deps.game.packs.get("dnd-4e-compendium.feature").metadata.packageName = "unrelated"; },
    deps => deps.game.packs.get("dnd4e.power").rows.delete("4"),
    deps => deps.game.packs.get("dnd-4e-compendium.feature").rows.set("variant", { _id: "variant", name: "Fighter" }),
    deps => { deps.game.packs.get("dnd4e.power").testUserPermission = () => false; }
  ]) {
    const deps = fixture();
    mutate(deps);
    assert.equal((await setupPc(args, deps)).status, "unresolved");
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.folderCalls.length, 0);
  }
});

test("explicit class/pack selectors resolve ambiguity and folder overrides create Actor paths", async () => {
  const deps = fixture();
  const classes = deps.game.packs.get("dnd-4e-compendium.feature");
  classes.rows.set("variant", { _id: "variant", name: "Fighter" });
  deps.game.packs.set("other.power", { ...deps.game.packs.get("dnd4e.power"), collection: "other.power" });
  const result = await setupPc({ ...args, classId: "0", corePack: "dnd4e.power", folder: "Campaign/Heroes" }, deps);
  assert.equal(result.status, "complete");
  assert.deepEqual(deps.folderCalls.map(folder => [folder.name, folder.type]), [["Campaign", "Actor"], ["Heroes", "Actor"]]);
});

test("rejects custom source data, wrong sessions and wrong item types before creation", async () => {
  for (const input of [
    { ...args, race: " " }, { ...args, class: undefined }, { ...args, system: {} },
    { ...args, items: [] }, { ...args, flags: {} }, { ...args, folder: " " }
  ]) {
    await assert.rejects(setupPc(input, fixture()));
  }
  for (const mutate of [
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.packs.get("dnd4e.power").getDocument = async () => { deps.game.user.isGM = false; }; },
    deps => { deps.game.packs.get("dnd4e.power").getDocument = async () => ({ type: "feature" }); }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(setupPc(args, deps));
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.folderCalls.length, 0);
  }
});

test("a disconnect after saving preserves the retry receipt", async () => {
  const deps = fixture();
  let connected = true;
  const create = deps.Actor.create;
  deps.Actor.create = async (...input) => {
    const actor = await create(...input);
    connected = false;
    return actor;
  };
  deps.assertConnection = () => { if (!connected) { throw new Error("Disconnected"); } };
  await assert.rejects(setupPc(args, deps), /Disconnected/);
  connected = true;
  assert.equal((await setupPc(args, deps)).reused, true);
  assert.equal(deps.calls.length, 1);
});
