import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { buildMagicItem } from "../scripts/magic-item-api.js";
import { mergeMagicItemSources, validateMagicItemRequest } from "../shared/magic-item-data.js";

const baseUuid = "Compendium.dnd-4e-compendium.module-equipment.Item.craghammer";
const enchantmentUuid = "Compendium.dnd-4e-compendium.module-equipment.Item.battering";
const args = { requestId: "battering-craghammer-1", baseUuid, enchantmentUuid, folder: "magic" };

/**
 * Model exact compendium variants and independent world Item creation.
 */
function fixture() {
  const calls = [];
  const packId = "dnd-4e-compendium.module-equipment";
  const base = { _id: "craghammer", name: "Craghammer", type: "weapon", img: "modules/dnd-4e-compendium/icons/craghammer.webp",
    system: { quantity: 1, level: 0, enhance: 0, price: 25, weaponType: "melee", weaponBaseType: "craghammer",
      profBonus: 2, damageDice: { parts: [{ numDice: "1", numFaces: "10", modifier: "" }] },
      weaponGroup: { ham: true }, properties: { bru: true }, brutalNum: 2, damageForm: "@enhance", range: { value: 1 },
      description: { value: "Base rules", chat: "Base flavor" }, critDamageForm: "(@enhance)d6", critDamageFormImp: "(@enhance)d6",
      damageCrit: { parts: [] }, damageCritImp: { parts: [] } }, effects: [{ _id: "base-effect", name: "Base effect" }] };
  const enchantment = { _id: "battering", name: "Battering Weapon +3", type: "weapon", img: "icons/svg/sword.svg",
    system: { level: 13, enhance: 3, price: 17000, rarity: "uncommon", description: { value: "Magic rules" },
      critDamageForm: "0", critDamageFormImp: "0", damageCrit: { parts: [{ formula: "3d6", type: ["force"] }] },
      damageCritImp: { parts: [{ formula: "3d8", type: ["force"] }] }, damageDice: { parts: [] } },
    effects: [{ _id: "magic-effect", name: "Magic effect" }] };
  const sourceDoc = (uuid, source) => ({ uuid, pack: packId, documentName: "Item", testUserPermission: () => true,
    toObject: () => structuredClone(source) });
  const docs = new Map([[baseUuid, sourceDoc(baseUuid, base)], [enchantmentUuid, sourceDoc(enchantmentUuid, enchantment)]]);
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" }, system: { id: "dnd4e", version: "0.9.3" },
    items: new Map(), folders: new Map([["magic", { id: "magic", name: "Magic Items", type: "Item" }]]),
    packs: new Map([[packId, { documentName: "Item", testUserPermission: () => true }]]) };
  const Item = { create: async (data, options) => {
    calls.push({ data: structuredClone(data), options });
    const id = `created${calls.length}`;
    const item = { id, uuid: `Item.${id}`, name: data.name, type: data.type, folder: game.folders.get(data.folder),
      getFlag: (scope, key) => data.flags?.[scope]?.[key] };
    game.items.set(id, item);
    return item;
  } };
  return { game, Item, calls, base, enchantment, docs, fromUuid: async uuid => docs.get(uuid), crypto: webcrypto };
}

test("standalone Battering Craghammer +3 preserves base weapon mechanics and variant crit data", async () => {
  const deps = fixture();
  const before = structuredClone([deps.base, deps.enchantment]);
  const result = await buildMagicItem({ ...args, quantity: 4 }, deps);
  assert.equal(result.name, "Battering Craghammer +3");
  assert.equal(deps.calls.length, 1);
  const data = deps.calls[0].data;
  assert.equal(data.system.quantity, 4);
  assert.equal(data.system.enhance, 3);
  assert.equal(data.system.price, 17000);
  assert.equal(data.system.level, 13);
  assert.equal(data.system.equipped, false);
  assert.equal(data.system.description.value, "Magic rules");
  for (const key of ["weaponBaseType", "weaponGroup", "damageDice", "profBonus", "properties", "brutalNum", "damageForm", "range"]) {
    assert.deepEqual(data.system[key], deps.base.system[key]);
  }
  assert.deepEqual(data.system.damageCrit, deps.enchantment.system.damageCrit);
  assert.deepEqual(data.system.damageCritImp, deps.enchantment.system.damageCritImp);
  assert.equal(data.system.critDamageFormImp, "0");
  assert.deepEqual(data.effects.map(effect => effect.name), ["Base effect", "Magic effect"]);
  assert.ok(data.effects.every(effect => !effect._id));
  assert.equal(data.img, "modules/dnd-4e-compendium/icons/craghammer3.webp");
  assert.equal(data.folder, "magic");
  assert.equal(Object.hasOwn(data, "_id"), false);
  assert.deepEqual([deps.base, deps.enchantment], before);
});

test("identical retries reuse final Item even after sources become unavailable; changed requests reject", async () => {
  const deps = fixture();
  const first = await buildMagicItem(args, deps);
  deps.docs.clear();
  assert.equal((await buildMagicItem({ ...args, quantity: 1 }, deps)).uuid, first.uuid);
  assert.equal(deps.calls.length, 1);
  await assert.rejects(buildMagicItem({ ...args, quantity: 2 }, deps), /different magic item/);
});

test("equipment merges apply masterwork AC while preserving armor penalties", () => {
  for (const [name, ac] of [["Chainmail", 12], ["Plate Armor", 14], ["Leather Armor", 4]]) {
    const base = { name, type: "equipment", img: "icons/svg/item-bag.svg", system: { armour: { ac: 2, enhance: 0, movePenValue: -1 } } };
    const magic = { name: "Dwarven Armor +6", type: "equipment", img: "icons/equipment/armor.webp",
      system: { level: 26, armour: { enhance: 6 }, price: 1000000 } };
    const result = mergeMagicItemSources(base, magic);
    assert.equal(result.system.armour.ac, ac);
    assert.equal(result.system.armour.enhance, 6);
    assert.equal(result.system.armour.movePenValue, -1);
    assert.equal(result.img, magic.img);
    assert.equal(result.name, `Dwarven ${name} +6`);
  }
});

test("implement naming and custom base artwork match the supported builder rules", () => {
  const deps = fixture();
  deps.base.name = "Holy Symbol";
  deps.base.img = "worlds/my-world/custom.webp";
  deps.base.system.weaponType = "implement";
  deps.enchantment.name = "Avenging Symbol +3";
  assert.equal(mergeMagicItemSources(deps.base, deps.enchantment).name, "Avenging Holy Symbol +3");
  assert.equal(mergeMagicItemSources(deps.base, deps.enchantment).img, deps.base.img);
  deps.enchantment.name = "Sunblade +3";
  assert.equal(mergeMagicItemSources(deps.base, deps.enchantment).name, "Sunblade Holy Symbol +3");
});

test("invalid selections, source permissions, system and session failures create nothing", async () => {
  for (const mutate of [
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.enchantment.type = "equipment"; },
    deps => { deps.enchantment.system.level = 0; },
    deps => { deps.docs.get(baseUuid).parent = {}; },
    deps => { deps.docs.get(baseUuid).testUserPermission = () => false; },
    deps => { deps.game.packs.values().next().value.testUserPermission = () => false; },
    deps => { deps.fromUuid = async uuid => { deps.game.user.isGM = false; return deps.docs.get(uuid); }; }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(buildMagicItem(args, deps));
    assert.deepEqual(deps.calls, []);
  }
  for (const invalid of [{ ...args, folder: undefined }, { ...args, baseUuid: "Item.world" },
    { ...args, enchantmentUuid: baseUuid }, { ...args, quantity: -1 }, { ...args, system: {} }]) {
    assert.throws(() => validateMagicItemRequest(invalid));
  }
});

test("sources changed while resolving a folder prevent final Item creation", async () => {
  const deps = fixture();
  deps.game.folders.clear();
  deps.Folder = { create: async data => {
    deps.enchantment.system.price = 1;
    return { ...data, id: "newfolder" };
  } };
  await assert.rejects(buildMagicItem(args, deps), /sources changed/);
  assert.deepEqual(deps.calls, []);
});
