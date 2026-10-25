import test from "node:test";
import assert from "node:assert/strict";
import { editPcPowers } from "../scripts/pc-power-api.js";
import { validatePcPowerEdit } from "../shared/pc-power-data.js";

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

const request = () => ({ uuid: "Actor.pc", powers: [{ id: "melee", system: {
  autoGenChatPowerCard: true, description: { chat: "New flavor" },
  damage: { parts: [{ formula: "1d6", type: ["fire"] }] }
} }] });

test("PC power review saves only approved fields, preserves effects, and retries without prompting", async () => {
  const deps = fixture();
  const before = structuredClone(deps.actor.items.get("melee").source);
  deps.actor.items.get("melee").source.system.damage = { parts: [] };
  deps.confirm = async proposal => {
    assert.equal(deps.calls.length, 0);
    assert.match(proposal.title, /PC power edits/);
    assert.equal(proposal.summary, "Enable automatic cards and fill the flavor.");
    assert.equal(proposal.changes.length, 3);
    return true;
  };
  const args = { ...request(), summary: "Enable automatic cards and fill the flavor." };
  assert.equal((await editPcPowers(args, deps)).status, "updated");
  const saved = deps.actor.items.get("melee").source;
  assert.equal(saved.system.autoGenChatPowerCard, true);
  assert.equal(saved.system.description.chat, "New flavor");
  assert.deepEqual(saved.effects, before.effects);
  assert.deepEqual(saved.flags, before.flags);
  assert.deepEqual(saved.system.attack, before.system.attack);
  deps.confirm = async () => assert.fail("No-op must not prompt");
  assert.equal((await editPcPowers(args, deps)).status, "unchanged");
});

test("cancelled/expired review, stale source and revoked sessions never save", async () => {
  for (const action of ["cancel", "expired", "stale", "removed", "session", "connection"]) {
    const deps = fixture();
    let disconnected = false;
    deps.assertConnection = () => {
      if (disconnected) {
        throw new Error("Disconnected");
      }
    };
    deps.confirm = async () => {
      if (action === "stale") {
        deps.actor.items.get("melee").source.system.description.chat = "Manual edit";
      }
      if (action === "removed") {
        deps.actor.items.delete("melee");
      }
      if (action === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (action === "connection") {
        disconnected = true;
      }
      return !["cancel", "expired"].includes(action);
    };
    const result = editPcPowers(request(), deps);
    if (["cancel", "expired"].includes(action)) {
      assert.equal((await result).status, "cancelled");
    } else {
      await assert.rejects(result);
    }
    assert.equal(deps.calls.length, 0);
  }
});

test("rejects non-PCs, non-powers, missing IDs and executable or arbitrary data", async () => {
  for (const mutate of [
    deps => { deps.actor.type = "NPC"; }, deps => { deps.actor.pack = "pack"; },
    deps => { deps.actor.parent = {}; }, deps => { deps.actor.items.get("melee").source.type = "feature"; },
    deps => { deps.actor.items.delete("melee"); }, deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.user.isActiveGM = false; }
  ]) {
    const deps = fixture();
    mutate(deps);
    deps.confirm = async () => assert.fail("Invalid request must not prompt");
    await assert.rejects(editPcPowers(request(), deps));
    assert.equal(deps.calls.length, 0);
  }
  for (const args of [
    { uuid: "Actor.pc", powers: [] }, { uuid: "Actor.pc", powers: [{ id: "melee", flags: {} }] },
    { uuid: "Actor.pc", powers: [{ id: "melee", system: { macros: [] } }] },
    { uuid: "Actor.pc", powers: [{ id: "melee", effects: [] }] },
    { uuid: "Actor.pc", powers: [{ id: "melee" }, { id: "melee" }] },
    { uuid: "Scene.s.Token.t.Actor.pc", powers: [{ id: "melee" }] },
    { uuid: "Actor.pc", system: {}, powers: [{ id: "melee" }] }
  ]) {
    assert.throws(() => validatePcPowerEdit(args));
  }
});

test("partial writes return receipts and retry only remaining power changes", async () => {
  const deps = fixture();
  const args = { uuid: "Actor.pc", powers: ["melee", "ranged"].map(id => ({ id, system: { autoGenChatPowerCard: true } })) };
  deps.actor.fail = true;
  const result = await editPcPowers(args, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 1);
  deps.actor.fail = false;
  assert.equal((await editPcPowers(args, deps)).status, "updated");
  assert.equal(deps.calls.at(-1).length, 1);
  assert.equal(deps.calls.at(-1)[0]._id, "ranged");
});
