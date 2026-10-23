import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { importPcOptions } from "../scripts/pc-import-api.js";
import { cleanPowerName } from "../shared/pc-import-data.js";

const args = { uuid: "Actor.pc", requestId: "pc-import-test", powers: [{ name: "Cleave", level: 1 }], feats: [{ name: "Toughness", level: 2 }] };

/**
 * Simulate compendium serialization and partial embedded saves, without Foundry.
 */
function fixture(powerName = "Cleave (Fighter Attack 1)", powerLevel = 9) {
  const calls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map(), packs: new Map()
  };
  const actor = { id: "pc", uuid: "Actor.pc", name: "Hero", type: "Player Character", items: new Map(),
    createEmbeddedDocuments: async (type, data) => {
      calls.push(data);
      for (const source of data) {
        if (actor.fail && source.type === "feature") {
          throw new Error("Simulated partial save");
        }
        const id = `item${actor.items.size}`;
        actor.items.set(id, { ...structuredClone(source), uuid: `Actor.pc.Item.${id}`,
          getFlag: (module, key) => source.flags?.[module]?.[key] });
      }
    }
  };
  game.actors.set(actor.id, actor);
  for (const [label, type, name] of [["Powers", "power", powerName], ["Feats", "feature", "Toughness"], ["Rituals", "ritual", "Gentle Repose"]]) {
    const collection = `dnd-4e-compendium.${label.toLowerCase()}`;
    const data = { _id: label, name, type, folder: "folder", ownership: {},
      system: { level: type === "power" ? powerLevel : 9, featureType: "feat", attack: { formula: "@strMod" } },
      effects: [{ name: "Native effect" }], flags: { automation: { enabled: true } } };
    const pack = {
      collection, metadata: { packageName: "dnd-4e-compendium", label }, documentName: "Item",
      testUserPermission: () => true, rows: new Map([[label, { _id: label, name }]]),
      getIndex: async () => pack.rows,
      getDocument: async () => ({ type, system: data.system, uuid: `Compendium.${collection}.Item.${label}`, toObject: () => structuredClone(data) })
    };
    game.packs.set(collection, pack);
  }
  return { game, actor, calls, crypto: webcrypto };
}

test("cleans catalogue class/level decorations without changing undecorated titles", () => {
  for (const name of ["Cleave (Fighter Attack 1)", "Cleave [Fighter 1]", "Cleave - Fighter Attack 1", "Fighter Attack 1: Cleave", "Cleave"]) {
    assert.equal(cleanPowerName(name), "Cleave");
  }
  assert.equal(cleanPowerName("Bigby's Icy Grasp"), "Bigby's Icy Grasp");
});

test("imports native data, cleans only power titles, sets levels and safely retries", async () => {
  const deps = fixture();
  const result = await importPcOptions(args, deps);
  assert.equal(result.status, "complete");
  assert.deepEqual(result.items.map(item => [item.name, item.level]), [["Cleave", 1], ["Toughness", 2]]);
  const [power] = deps.calls[0];
  assert.equal(power._id, undefined);
  assert.equal(power.folder, undefined);
  assert.equal(power.system.attack.formula, "@strMod");
  assert.equal(power.effects[0].name, "Native effect");
  assert.equal(power.flags.automation.enabled, true);
  deps.game = { ...deps.game };
  assert.ok((await importPcOptions(args, deps)).items.every(item => item.status === "existing"));
  assert.equal(deps.calls.length, 1);
  await assert.rejects(importPcOptions({ ...args, powers: [{ name: "Cleave", level: 3 }] }, deps), /different PC import data/);
  await importPcOptions({ ...args, requestId: "new-import-id" }, deps);
  assert.equal(deps.calls.length, 1);
});

test("imports actual class-level-prefixed compendium titles using the plain power name", async () => {
  for (const [sourceName, name] of [
    ["Rogue 01-Deft Strike", "Deft Strike"],
    ["Warlord 01-Race the Arrow", "Race the Arrow"],
    ["Fighter 01-Footwork Lure", "Footwork Lure"]
  ]) {
    const deps = fixture(sourceName);
    const result = await importPcOptions({ ...args, powers: [{ name, level: 1 }], feats: [] }, deps);
    assert.equal(result.status, "complete");
    assert.equal(result.items[0].name, name);
    assert.equal(deps.calls[0][0].name, name);
  }
});

test("missing and ambiguous choices write nothing; IDs disambiguate", async () => {
  const deps = fixture();
  const pack = deps.game.packs.get("dnd-4e-compendium.powers");
  pack.rows.set("second", { _id: "second", name: "Cleave (Fighter Attack 3)" });
  const result = await importPcOptions(args, deps);
  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates.length, 2);
  assert.equal(deps.calls.length, 0);
  assert.equal((await importPcOptions({ ...args, powers: [{ name: "Unknown", level: 1 }] }, deps)).status, "unresolved");
  assert.equal((await importPcOptions({ ...args, powers: [{ name: "Cleave (Fighter Attack 1)", level: 1 }] }, deps)).status, "complete");
  assert.equal((await importPcOptions({ ...args, requestId: "id-selection-test", powers: [{ id: "Powers", level: 1 }] }, deps)).status, "complete");
});

test("imports class and racial feature powers with clean names and preserves unset or numeric source levels", async () => {
  for (const [sourceName, name] of [
    ["Shaman-Call Spirit Companion", "Call Spirit Companion"],
    ["Shaman-Healing Spirit", "Healing Spirit"],
    ["Druid-Call the Spirits", "Call the Spirits"],
    ["Druid-Verdant Touch", "Verdant Touch"],
    ["Half-Orc Power-Furious Assault", "Furious Assault"]
  ]) {
    for (const level of [null, 9]) {
      const deps = fixture(sourceName, level);
      const result = await importPcOptions({ ...args, powers: [{ name }], feats: [] }, deps);
      assert.equal(result.status, "complete");
      assert.equal(result.items[0].name, name);
      assert.equal(result.items[0].level, level);
      assert.equal(deps.calls[0][0].system.level, level);
    }
  }
  assert.equal(cleanPowerName("Will-o'-the-Wisp"), "Will-o'-the-Wisp");
});

test("imports equipment powers from either supported pack label with source levels and safe retries", async () => {
  for (const label of ["Equipment Powers", "Powers (Equipment)"]) {
    const deps = fixture("Frost Weapon Power", null);
    const pack = deps.game.packs.get("dnd-4e-compendium.powers");
    pack.metadata.label = label;
    const request = { uuid: args.uuid, requestId: "equipment-powers-test", equipmentPowers: [{ id: "Powers" }] };
    const result = await importPcOptions(request, deps);
    assert.equal(result.status, "complete");
    assert.equal(result.items[0].level, null);
    assert.equal(deps.calls[0][0].type, "power");
    assert.equal(deps.calls[0][0].name, "Frost Weapon Power");
    assert.deepEqual(deps.calls[0][0].effects, [{ name: "Native effect" }]);
    assert.equal(deps.calls[0][0].system.attack.formula, "@strMod");
    assert.equal((await importPcOptions(request, deps)).items[0].status, "existing");
    assert.equal(deps.calls.length, 1);
  }
  const deps = fixture("Frost Weapon Power", 3);
  deps.game.packs.get("dnd-4e-compendium.powers").metadata.label = "Equipment Powers";
  const result = await importPcOptions({ uuid: args.uuid, requestId: "equipment-level-test",
    equipmentPowers: [{ name: "frost weapon power", level: 8 }] }, deps);
  assert.equal(result.items[0].level, 8);
});

test("equipment power selection rejects missing, ambiguous or untrusted packs and wrong item types", async () => {
  for (const mutate of [
    deps => { deps.game.packs.clear(); },
    deps => { deps.game.packs.get("dnd-4e-compendium.powers").metadata.packageName = "other"; },
    deps => { deps.game.packs.get("dnd-4e-compendium.powers").testUserPermission = () => false; },
    deps => { deps.game.packs.get("dnd-4e-compendium.powers").getDocument = async () => ({ type: "equipment" }); },
    deps => { const pack = deps.game.packs.get("dnd-4e-compendium.powers");
      deps.game.packs.set("second", { ...pack, metadata: { ...pack.metadata, label: "Powers (Equipment)" } }); }
  ]) {
    const deps = fixture();
    deps.game.packs.get("dnd-4e-compendium.powers").metadata.label = "Equipment Powers";
    mutate(deps);
    await assert.rejects(importPcOptions({ uuid: args.uuid, requestId: "equipment-invalid-test",
      equipmentPowers: [{ id: "Powers" }] }, deps));
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  deps.game.packs.get("dnd-4e-compendium.powers").metadata.label = "Equipment Powers";
  assert.equal((await importPcOptions({ uuid: args.uuid, requestId: "equipment-missing-test",
    equipmentPowers: [{ name: "Missing" }] }, deps)).status, "unresolved");
  assert.equal(deps.calls.length, 0);
});

test("partial writes are reported and retry creates only missing entries", async () => {
  const deps = fixture();
  deps.actor.fail = true;
  assert.equal((await importPcOptions(args, deps)).status, "incomplete");
  assert.equal(deps.actor.items.size, 1);
  deps.actor.fail = false;
  assert.equal((await importPcOptions(args, deps)).status, "complete");
  assert.equal(deps.actor.items.size, 2);
  assert.equal(deps.calls[1].length, 1);
});

test("imports rituals with native data, optional levels and duplicate protection", async () => {
  const deps = fixture();
  const pack = deps.game.packs.get("dnd-4e-compendium.rituals");
  const getDocument = pack.getDocument;
  pack.getDocument = async () => {
    const source = await getDocument();
    const toObject = source.toObject;
    source.toObject = () => ({ ...toObject(), system: {
      level: 1, category: "restoration", castTime: { value: "1", units: "hour" },
      market: "50 gp", requirements: "10 gp", attribute: "skills.rel.total", formula: "@skill"
    } });
    return source;
  };
  const request = { uuid: args.uuid, requestId: args.requestId, rituals: [{ name: "gentle repose" }] };
  assert.equal((await importPcOptions(request, deps)).status, "complete");
  const ritual = deps.calls[0][0];
  assert.equal(ritual.type, "ritual");
  assert.equal(ritual.name, "Gentle Repose");
  assert.equal(ritual.system.level, 1);
  assert.equal(ritual.system.castTime.units, "hour");
  assert.equal(ritual.system.requirements, "10 gp");
  assert.equal(ritual.system.category, "restoration");
  assert.equal(ritual.effects[0].name, "Native effect");
  assert.equal((await importPcOptions(request, deps)).items[0].status, "existing");
  assert.equal(deps.calls.length, 1);
  await assert.rejects(importPcOptions({ ...request, rituals: [{ name: "Gentle Repose", level: 5 }] }, deps), /different PC import data/);
  const fresh = fixture();
  assert.equal((await importPcOptions({ ...request, rituals: [{ id: "Rituals", level: 5 }] }, fresh)).items[0].level, 5);
});

test("unresolved rituals prevent mixed-batch writes and reject wrong source types", async () => {
  const deps = fixture();
  const request = { ...args, rituals: [{ name: "Unknown" }] };
  assert.equal((await importPcOptions(request, deps)).status, "unresolved");
  assert.equal(deps.calls.length, 0);
  const pack = deps.game.packs.get("dnd-4e-compendium.rituals");
  pack.rows.set("second", { _id: "second", name: "Gentle Repose" });
  request.rituals = [{ name: "Gentle Repose" }];
  assert.equal((await importPcOptions(request, deps)).candidates.length, 2);
  assert.equal(deps.calls.length, 0);
  request.rituals = [{ id: "Rituals" }];
  pack.getDocument = async () => ({ type: "power" });
  await assert.rejects(importPcOptions(request, deps), /wrong Item type/);
  assert.equal(deps.calls.length, 0);
});

/**
 * Add a trusted inventory source while retaining native serialization details.
 */
function inventoryFixture(type = "weapon") {
  const deps = fixture();
  const id = "magicItem";
  const collection = "dnd-4e-compendium.magic-weapons";
  const source = { _id: id, name: "Frost Weapon", type, folder: "source-folder",
    system: { level: 8, enhance: 2, quantity: 1, equipped: true,
      damageCrit: { parts: [{ formula: "2d6", type: ["cold"] }] } },
    effects: [{ name: "Native bonus" }], flags: { automation: { enabled: true } } };
  const pack = { collection, documentName: "Item", metadata: { packageName: "dnd-4e-compendium", label: "Magic Weapons" },
    testUserPermission: () => true, rows: new Map([[id, { _id: id, name: source.name }]]),
    getIndex: async () => pack.rows,
    getDocument: async () => ({ type: source.type, system: source.system,
      uuid: `Compendium.${collection}.Item.${id}`, toObject: () => structuredClone(source) }) };
  deps.game.packs.set(collection, pack);
  return { ...deps, pack, source, request: { uuid: args.uuid, requestId: "magic-import-test", magicItems: [{ pack: collection, id }] } };
}

test("imports inventory types unequipped, preserving native mechanics and source receipts", async () => {
  for (const type of ["weapon", "equipment", "consumable", "tool", "loot", "backpack"]) {
    const deps = inventoryFixture(type);
    const result = await importPcOptions(deps.request, deps);
    assert.equal(result.status, "complete");
    const item = deps.calls[0][0];
    assert.equal(item.type, type);
    assert.equal(item.system.level, 8);
    assert.equal(item.system.enhance, 2);
    assert.equal(item.system.quantity, 1);
    assert.equal(item.system.equipped, false);
    assert.deepEqual(item.system.damageCrit, deps.source.system.damageCrit);
    assert.deepEqual(item.effects, deps.source.effects);
    assert.equal(item.flags.automation.enabled, true);
    assert.equal(item._id, undefined);
    assert.equal(item.folder, undefined);
    assert.equal((await importPcOptions(deps.request, deps)).items[0].status, "existing");
    assert.equal(deps.calls.length, 1);
    await assert.rejects(importPcOptions({ ...deps.request, magicItems: [{ pack: deps.pack.collection, name: "Frost Weapon" }] }, deps), /different PC import data/);
  }
});

test("same-name magic item variants coexist, but existing core source links prevent duplicates", async () => {
  const deps = inventoryFixture();
  deps.actor.items.set("old", { type: "weapon", name: "Frost Weapon", system: { level: 3 },
    uuid: "Actor.pc.Item.old", getFlag: () => undefined });
  assert.equal((await importPcOptions(deps.request, deps)).items[0].status, "imported");
  assert.equal(deps.actor.items.size, 2);
  const fresh = inventoryFixture();
  fresh.actor.items.set("old", { type: "weapon", name: "Renamed Weapon", system: { level: 8 },
    uuid: "Actor.pc.Item.old", getFlag: (module, key) => module === "core" && key === "sourceId"
      ? `Compendium.${fresh.pack.collection}.Item.magicItem` : undefined });
  assert.equal((await importPcOptions(fresh.request, fresh)).items[0].status, "existing");
  assert.equal(fresh.calls.length, 0);
});

test("missing and ambiguous magic items prevent mixed-batch writes; names and IDs select entries", async () => {
  const deps = inventoryFixture();
  const request = { ...args, magicItems: [{ pack: deps.pack.collection, name: "Missing" }] };
  assert.equal((await importPcOptions(request, deps)).status, "unresolved");
  deps.pack.rows.set("other", { _id: "other", name: "Frost Weapon" });
  request.magicItems[0].name = "frost weapon";
  assert.equal((await importPcOptions(request, deps)).candidates.length, 2);
  assert.equal(deps.calls.length, 0);
  deps.pack.rows.delete("other");
  assert.equal((await importPcOptions(request, deps)).status, "complete");
});

test("inventory rejects untrusted packs, non-inventory sources and invalid selections", async () => {
  for (const mutate of [
    deps => { deps.pack.metadata.packageName = "other"; },
    deps => { deps.pack.documentName = "Actor"; },
    deps => { deps.pack.testUserPermission = () => false; },
    deps => { deps.source.type = "power"; },
    deps => { deps.request.magicItems[0].pack = "missing"; },
    deps => { delete deps.request.magicItems[0].pack; },
    deps => { deps.request.magicItems[0].level = 9; },
    deps => { deps.request.magicItems[0].quantity = 2; },
    deps => { deps.request.magicItems[0].name = "Frost Weapon"; },
    deps => { deps.request.magicItems = Array.from({ length: 101 }, () => deps.request.magicItems[0]); }
  ]) {
    const deps = inventoryFixture();
    mutate(deps);
    await assert.rejects(importPcOptions(deps.request, deps));
    assert.equal(deps.calls.length, 0);
  }
});

test("partial mixed inventory imports recover without duplicate gear", async () => {
  const deps = inventoryFixture();
  const request = { ...args, magicItems: deps.request.magicItems };
  const create = deps.actor.createEmbeddedDocuments;
  deps.actor.createEmbeddedDocuments = async (type, sources) => {
    await create(type, sources.slice(0, -1));
    throw new Error("Partial inventory save");
  };
  assert.equal((await importPcOptions(request, deps)).status, "incomplete");
  deps.actor.createEmbeddedDocuments = create;
  assert.equal((await importPcOptions(request, deps)).status, "complete");
  assert.equal(deps.actor.items.size, 3);
  assert.equal(deps.calls[1].length, 1);
});

test("rejects invalid requests, wrong targets, untrusted packs and lost sessions", async () => {
  for (const change of [
    { ...args, powers: [{ name: "Cleave", level: 0 }] },
    { ...args, feats: [{ name: "Toughness", id: "feat", level: 1 }] },
    { ...args, feats: [{ name: "Toughness" }] },
    { ...args, rituals: [{ name: "Gentle Repose", level: 31 }] },
    { ...args, equipmentPowers: [{ name: "Frost", level: 31 }] },
    { ...args, equipmentPowers: [{ name: "Frost", id: "power" }] },
    { ...args, equipmentPowers: Array.from({ length: 99 }, () => ({ name: "Frost" })) },
    { ...args, rituals: [{ name: "Gentle Repose", system: {} }] },
    { ...args, rituals: Array.from({ length: 99 }, () => ({ name: "Gentle Repose" })) },
    { ...args, flags: {} }, { ...args, powers: [], feats: [] }
  ]) {
    const deps = fixture();
    await assert.rejects(importPcOptions(change, deps));
    assert.equal(deps.calls.length, 0);
  }
  for (const mutate of [
    deps => { deps.actor.type = "NPC"; },
    deps => { deps.actor.parent = {}; },
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.packs.get("dnd-4e-compendium.powers").metadata.packageName = "other"; },
    deps => { deps.game.packs.get("dnd-4e-compendium.powers").getDocument = async () => { deps.game.user.isGM = false; }; }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(importPcOptions(args, deps));
    assert.equal(deps.calls.length, 0);
  }
});
