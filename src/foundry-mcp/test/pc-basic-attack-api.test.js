import test from "node:test";
import assert from "node:assert/strict";
import { setPcBasicAttackAbility } from "../scripts/pc-basic-attack-api.js";

/**
 * Model native core powers, source snapshots and partial Item updates.
 */
function fixture() {
  const calls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map()
  };
  const actor = { id: "pc", uuid: "Actor.pc", name: "Hero", type: "Player Character", items: new Map(),
    updateEmbeddedDocuments: async (type, updates) => {
      assert.equal(type, "Item");
      calls.push(updates);
      for (const { _id, ...patch } of updates) {
        const item = actor.items.get(_id);
        if (actor.fail && _id === "ranged") {
          throw new Error("Partial update");
        }
        for (const [path, value] of Object.entries(patch)) {
          const keys = path.split(".");
          const last = keys.pop();
          keys.reduce((obj, key) => obj[key], item.source)[last] = value;
        }
      }
    }
  };
  game.actors.set(actor.id, actor);
  for (const [id, name, ability, label] of [["melee", "Melee Basic Attack", "str", "Strength"], ["ranged", "Ranged Basic Attack", "dex", "Dexterity"]]) {
    const source = { name, type: "power", system: {
      attack: { ability, isBasic: true, formula: "@wepAttack + @powerMod + @lvhalf" },
      hit: { formula: "@powBase + @powerMod + @wepDamage", critFormula: "@powMax + @powerMod + @wepDamage + @wepCritBonus", detail: `1[W] + ${label} modifier damage.` },
      description: { value: `<p>Attack: ${label} vs. AC. Hit: 1[W] + ${label} modifier damage.</p>`, chat: "Flavor" }
    }, flags: { untouched: true }, effects: [{ name: "Existing effect" }] };
    actor.items.set(id, { id, name, uuid: `Actor.pc.Item.${id}`, parent: actor, source, toObject: () => structuredClone(source) });
  }
  return { game, actor, calls, confirm: async () => true };
}

test("confirmed basic attacks use Int or Wis for attack/damage, synchronize labels, preserve formulas/effects and retry safely", async () => {
  for (const [ability, label] of [["int", "Intelligence"], ["wis", "Wisdom"]]) {
    const deps = fixture();
    const before = structuredClone([...deps.actor.items.values()].map(item => item.source));
    deps.confirm = async ({ changes, title }) => {
      assert.equal(deps.calls.length, 0);
      assert.equal(changes.length, 6);
      assert.match(title, /PC basic attacks/);
      return true;
    };
    assert.equal((await setPcBasicAttackAbility({ uuid: "Actor.pc", ability }, deps)).status, "updated");
    for (const [index, item] of [...deps.actor.items.values()].entries()) {
      assert.equal(item.source.system.attack.ability, ability);
      assert.match(item.source.system.hit.detail, new RegExp(label));
      assert.match(item.source.system.description.value, new RegExp(label));
      const expected = before[index];
      expected.system.attack.ability = ability;
      expected.system.hit.detail = item.source.system.hit.detail;
      expected.system.description.value = item.source.system.description.value;
      assert.deepEqual(item.source, expected);
    }
    deps.confirm = async () => { assert.fail("Already applied changes must not prompt"); };
    assert.equal((await setPcBasicAttackAbility({ uuid: "Actor.pc", ability }, deps)).status, "unchanged");
  }
});

test("cancel, stale powers, duplicates and session changes prevent writes", async () => {
  for (const action of ["cancel", "stale", "duplicate", "session", "removed"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (action === "stale") {
        deps.actor.items.get("melee").source.system.hit.detail = "Manual change";
      }
      if (action === "duplicate") {
        deps.actor.items.set("duplicate", deps.actor.items.get("melee"));
      }
      if (action === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (action === "removed") {
        deps.actor.items.delete("melee");
      }
      return action !== "cancel";
    };
    const promise = setPcBasicAttackAbility({ uuid: "Actor.pc", ability: "int" }, deps);
    if (action === "cancel") {
      assert.equal((await promise).status, "cancelled");
    } else {
      await assert.rejects(promise);
    }
    assert.equal(deps.calls.length, 0);
  }
});

test("rejects unsupported actors, custom powers, invalid requests and revoked access before prompting", async () => {
  for (const mutate of [
    deps => { deps.actor.type = "NPC"; }, deps => { deps.actor.parent = {}; }, deps => { deps.actor.pack = "pack"; },
    deps => { deps.actor.items.delete("ranged"); }, deps => { deps.actor.items.get("melee").source.type = "feature"; },
    deps => { deps.actor.items.get("melee").source.system.attack.isBasic = false; },
    deps => { deps.actor.items.get("melee").source.system.hit.formula = "2d6+5"; },
    deps => { deps.game.user.isActiveGM = false; }, deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.assertConnection = () => { throw new Error("Disconnected"); }; }
  ]) {
    const deps = fixture();
    mutate(deps);
    deps.confirm = async () => { assert.fail("Invalid changes must not prompt"); };
    await assert.rejects(setPcBasicAttackAbility({ uuid: "Actor.pc", ability: "int" }, deps));
    assert.equal(deps.calls.length, 0);
  }
  for (const args of [{ uuid: "Actor.pc", ability: "INT" }, { uuid: "Actor.pc", ability: "constructor" }, { uuid: "Actor.pc" }, { uuid: "Actor.pc", ability: "wis", items: [] }, { uuid: "Scene.s.Token.t.Actor.pc", ability: "wis" }]) {
    await assert.rejects(setPcBasicAttackAbility(args, fixture()));
  }
});

test("partial writes report saved fields and retries only update the remaining power", async () => {
  const deps = fixture();
  deps.actor.fail = true;
  const args = { uuid: "Actor.pc", ability: "wis" };
  const result = await setPcBasicAttackAbility(args, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 3);
  deps.actor.fail = false;
  assert.equal((await setPcBasicAttackAbility(args, deps)).status, "updated");
  assert.equal(deps.calls.at(-1).length, 1);
  assert.equal(deps.calls.at(-1)[0]._id, "ranged");
});

test("basic attack confirmation forwards an authored summary and supplies a readable default", async () => {
  for (const summary of [undefined, "Change both of Mork's basic attacks to Wisdom."]) {
    const deps = fixture();
    deps.confirm = async proposal => {
      assert.equal(proposal.summary, summary ?? "Use Wisdom for attack and damage on both of Hero's basic attacks.");
      return false;
    };
    assert.equal((await setPcBasicAttackAbility({ uuid: "Actor.pc", ability: "wis", ...(summary ? { summary } : {}) }, deps)).status, "cancelled");
    assert.equal(deps.calls.length, 0);
  }
});
