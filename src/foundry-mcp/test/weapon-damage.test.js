import test from "node:test";
import assert from "node:assert/strict";
import { editWeaponDamage } from "../scripts/weapon-damage-api.js";
import { validateWeaponDamage } from "../shared/weapon-damage-data.js";

/**
 * Model independent world and merchant weapons and native update-data mutation.
 */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, items: new Map(), actors: new Map() };
  const actor = { uuid: "Actor.merchant", type: "NPC", items: new Map() };
  game.actors.set("merchant", actor);
  const writes = [];
  for (const [uuid, parent] of [["Item.one", null], ["Actor.merchant.Item.two", actor]]) {
    const source = { name: "Pistol", type: "weapon", system: { enhance: 2,
      damageDice: { parts: [{ numDice: "1", numFaces: "6", modifier: "+1" }] },
      critDamageForm: "2d6", damageForm: "@enhance", description: { value: "Damage: 1d6", chat: "Flavor" } },
      effects: [{ name: "Effect" }], flags: { original: true } };
    const item = { uuid, parent, type: "weapon", name: source.name, source,
      toObject: () => structuredClone(source), update: async patch => {
        writes.push(uuid);
        for (const [path, value] of Object.entries(patch)) {
          const keys = path.split(".");
          const target = keys.slice(0, -1).reduce((value, key) => value[key], source);
          target[keys.at(-1)] = structuredClone(value);
        }
        // Foundry may expand the flat update object in place.
        Object.keys(patch).forEach(key => delete patch[key]);
        patch.system = structuredClone(source.system);
      } };
    (parent?.items ?? game.items).set(uuid.split(".").at(-1), item);
  }
  return { game, writes, confirm: async () => true };
}
const request = { items: [
  { uuid: "Item.one", numDice: 2, numFaces: 6, description: "Damage: 2d6" },
  { uuid: "Actor.merchant.Item.two", numDice: 2, numFaces: 6 }
] };

test("confirmed dice edits preserve modifiers, enhancement, critical dice, effects and omitted text; retry is a no-op", async () => {
  const deps = fixture();
  const before = deps.game.items.get("one").toObject();
  assert.equal((await editWeaponDamage(request, deps)).status, "updated");
  assert.deepEqual(deps.game.items.get("one").toObject(), { ...before, system: { ...before.system,
    damageDice: { parts: [{ numDice: "2", numFaces: "6", modifier: "+1" }] },
    description: { value: "Damage: 2d6", chat: "Flavor" } } });
  assert.equal(deps.game.actors.get("merchant").items.get("two").source.system.description.value, "Damage: 1d6");
  deps.confirm = async () => assert.fail("No-op retry must not prompt");
  assert.equal((await editWeaponDamage(request, deps)).status, "unchanged");
  assert.equal(deps.writes.length, 2);
});

test("cancel, stale source, actor replacement and lost session never write", async () => {
  for (const mode of ["cancel", "stale", "actor", "session"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") {
        deps.game.items.get("one").source.system.enhance = 3;
      }
      if (mode === "actor") {
        deps.game.actors.set("merchant", { ...deps.game.actors.get("merchant") });
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await editWeaponDamage(request, deps)).status, "cancelled");
    } else {
      await assert.rejects(editWeaponDamage(request, deps));
    }
    assert.equal(deps.writes.length, 0);
  }
});

test("partial writes report receipts and retry only unsaved weapons", async () => {
  const deps = fixture();
  const second = deps.game.actors.get("merchant").items.get("two");
  const update = second.update;
  second.update = async () => { throw new Error("save failed"); };
  const result = await editWeaponDamage(request, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied.map(item => item.uuid), ["Item.one"]);
  second.update = update;
  assert.equal((await editWeaponDamage(request, deps)).status, "updated");
  assert.equal(deps.writes.length, 2);
});

test("invalid dice, unknown fields and unsupported targets fail before approval", async () => {
  for (const args of [{ items: [] }, { items: [request.items[0], request.items[0]] },
    ...[0, 101, 1.5].map(numDice => ({ items: [{ uuid: "Item.one", numDice, numFaces: 6 }] })),
    ...[0, 7, 6.5].map(numFaces => ({ items: [{ uuid: "Item.one", numDice: 2, numFaces }] })),
    { items: [{ uuid: "Compendium.pack.Item.one", numDice: 2, numFaces: 6 }] },
    { items: [{ uuid: "Item.one", numDice: 2 }] },
    { items: [{ ...request.items[0], enhance: 3 }] },
    { items: [{ ...request.items[0], description: "x".repeat(50001) }] }]) {
    assert.throws(() => validateWeaponDamage(args));
  }
  for (const mode of ["token", "pack", "nonweapon", "compound", "missing"]) {
    const deps = fixture();
    if (mode === "token") {
      deps.game.actors.get("merchant").isToken = true;
    }
    if (mode === "pack") {
      deps.game.items.get("one").pack = "pack";
    }
    if (mode === "nonweapon") {
      deps.game.items.get("one").type = "power";
    }
    if (mode === "compound") {
      deps.game.items.get("one").source.system.damageDice.parts.push({ numDice: "1", numFaces: "4" });
    }
    if (mode === "missing") {
      deps.game.items.get("one").source.system.damageDice.parts = [];
    }
    deps.confirm = async () => assert.fail("Unsupported targets must not prompt");
    await assert.rejects(editWeaponDamage(request, deps));
    assert.equal(deps.writes.length, 0);
  }
});

test("concurrent reviews are rejected and caller mutation cannot change approved dice", async () => {
  const deps = fixture();
  let finish;
  deps.confirm = () => new Promise(resolve => { finish = resolve; });
  const args = structuredClone(request);
  const running = editWeaponDamage(args, deps);
  args.items[0].numDice = 9;
  await assert.rejects(editWeaponDamage(request, deps), /awaiting confirmation/);
  finish(true);
  assert.equal((await running).status, "updated");
  assert.equal(deps.game.items.get("one").source.system.damageDice.parts[0].numDice, "2");
});
