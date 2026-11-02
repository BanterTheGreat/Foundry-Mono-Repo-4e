import test from "node:test";
import assert from "node:assert/strict";
import { findHpDamageSource, findHpDamage } from "../scripts/modules/trigger-prompts/hp-damage-source.js";

const change = { sceneId: "scene", tokenId: "enemy", oldHp: 8, newHp: -2 };
const message = (key = "enemy", state = "applying") => ({
  speaker: { token: "speaker" },
  flags: { "dnd4e-health-display": {
    damageApplication: { sceneId: "scene" },
    attackResults: { casterId: "hero" },
    damageApplications: { [key]: { state, health: { before: 8, after: -2 } } },
  } },
});

test("HP attribution uses an in-flight matching receipt and the individual group attacker", () => {
  assert.deepEqual(findHpDamageSource([message()], change), { sceneId: "scene", tokenId: "hero" });
  assert.deepEqual(findHpDamageSource([message("second:enemy")], change), { sceneId: "scene", tokenId: "second" });
});

test("HP restrictions read the matched attack's weapon mode and fail closed without range data", () => {
  const data = message();
  data.flags["dnd4e-health-display"].damageApplication.itemUuid = "Actor.hero.Item.attack";
  globalThis.fromUuidSync = () => ({ system: { rangeType: "weapon", weaponType: "ranged" } });
  assert.equal(findHpDamage([data], change).attackRange, "range");
  globalThis.fromUuidSync = () => ({ system: { rangeType: "weapon", weaponType: "melee" } });
  assert.equal(findHpDamage([data], change).attackRange, "weapon");
  globalThis.fromUuidSync = () => null;
  assert.equal(findHpDamage([data], change).attackRange, null);
  delete globalThis.fromUuidSync;
});

test("manual edits and stale, unrelated or mismatched damage receipts have no attributed attacker", () => {
  assert.equal(findHpDamageSource([], change), null);
  assert.equal(findHpDamageSource([message("enemy", "applied")], change), null);
  assert.equal(findHpDamageSource([message("other")], change), null);
  assert.equal(findHpDamageSource([message()], { ...change, sceneId: "other" }), null);
  assert.equal(findHpDamageSource([message()], { ...change, oldHp: 9 }), null);
  assert.equal(findHpDamageSource([message()], { ...change, newHp: 0 }), null);
});
