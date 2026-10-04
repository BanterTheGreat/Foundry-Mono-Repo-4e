import test from "node:test";
import assert from "node:assert/strict";
import { editNpc, confirmNpcEdit } from "../scripts/edit-api.js";
import { MODULE_ID } from "../shared/protocol.js";

/**
 * Model source documents and awaited update APIs without operating Foundry.
 */
function fixture() {
  const calls = [];
  const game = {
    ready: true, socket: { connected: true }, user: { id: "gm", isGM: true, isActiveGM: true },
    settings: { get: () => true }, world: { id: "world" }, system: { id: "dnd4e", version: "0.9.3" }, actors: new Map()
  };
  const source = { name: "Troll", type: "NPC", system: { attributes: { hp: { value: 100, max: 100 } }, details: { level: 5 } } };
  const actor = {
    id: "npc", uuid: "Actor.npc", name: source.name, type: source.type, items: new Map(),
    toObject: () => structuredClone(source),
    update: async patch => {
      calls.push({ actor: patch });
      apply(source, patch);
      actor.name = source.name;
      return actor;
    },
    updateEmbeddedDocuments: async (type, patches) => {
      calls.push({ type, items: patches });
      return patches.map(({ _id, ...patch }) => {
        const item = actor.items.get(_id);
        apply(item.source, patch);
        return item;
      });
    }
  };
  const item = {
    id: "claw", uuid: "Actor.npc.Item.claw", name: "Claw", type: "power", parent: actor,
    source: { name: "Claw", type: "power", system: { attack: { formula: "10", isAttack: true } }, effects: [{ name: "Existing effect" }] },
    toObject: () => structuredClone(item.source), effects: new Map(),
    createEmbeddedDocuments: async (type, data) => {
      calls.push({ effectType: type, data });
      return data.map(source => {
        const effect = { id: `effect${item.effects.size}`, getFlag: (module, key) => source.flags?.[module]?.[key], toObject: () => structuredClone(source) };
        item.effects.set(effect.id, effect);
        item.source.effects.push(source);
        return effect;
      });
    }
  };
  actor.items.set(item.id, item);
  game.actors.set(actor.id, actor);
  const deps = { game, calls, actor, item, source, notify: () => {}, confirm: async () => true };
  return deps;
}

/**
 * Apply the flattened patches accepted by Foundry update APIs.
 */
function apply(source, patch) {
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split(".");
    const key = keys.pop();
    const parent = keys.reduce((target, part) => target[part] ??= {}, source);
    parent[key] = value;
  }
}

test("summarizes source changes before approval, preserves omitted data, and awaits NPC/item updates", async () => {
  const deps = fixture();
  deps.confirm = async summary => {
    assert.equal(deps.calls.length, 0);
    assert.deepEqual(summary.changes.map(change => [change.path, change.before, change.after]), [
      ["system.attributes.hp.max", 100, 120], ["system.attack.formula", "10", "12"]
    ]);
    return true;
  };
  const result = await editNpc({ uuid: "Actor.npc", system: { attributes: { hp: { max: 120 } } }, items: [{ id: "claw", type: "power", system: { attack: { formula: "12" } } }] }, deps);
  assert.equal(result.status, "updated");
  assert.equal(deps.source.system.attributes.hp.value, 100);
  assert.equal(deps.source.system.attributes.hp.max, 120);
  assert.equal(deps.item.source.system.attack.isAttack, true);
  assert.equal(deps.item.source.effects.length, 1);
  assert.equal(deps.calls.length, 2);
});

test("cancel/close and unchanged retries never save documents", async () => {
  for (const answer of [false, null, undefined]) {
    const deps = fixture();
    deps.confirm = async () => answer;
    assert.equal((await editNpc({ uuid: "Actor.npc", name: "Other" }, deps)).status, "cancelled");
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  deps.confirm = async () => { throw new Error("Should not prompt for unchanged data"); };
  assert.equal((await editNpc({ uuid: "Actor.npc", name: "Troll" }, deps)).status, "unchanged");
});

test("rejects PCs, compendiums, token UUIDs, unknown fields, effects and wrong embedded IDs/types before prompting", async () => {
  for (const args of [
    { uuid: "Scene.scene.Token.token.Actor.npc", name: "X" },
    { uuid: "Actor.npc", type: "NPC" }, { uuid: "Actor.npc", flags: {} },
    { uuid: "Actor.npc", system: { "details.level": 10 } },
    { uuid: "Actor.npc", system: JSON.parse('{"__proto__":{}}') },
    { uuid: "Actor.npc", items: [{ id: "missing", type: "power", name: "X" }] },
    { uuid: "Actor.npc", items: [{ id: "claw", type: "feature", name: "X" }] },
    { uuid: "Actor.npc", items: [{ id: "claw", type: "power", effects: [] }] },
    { uuid: "Actor.npc", items: [{ id: "claw", type: "power" }, { id: "claw", type: "power" }] }
  ]) {
    const deps = fixture();
    deps.confirm = async () => { assert.fail("Invalid edits must not prompt"); };
    await assert.rejects(editNpc(args, deps));
    assert.equal(deps.calls.length, 0);
  }
  for (const mutation of [deps => { deps.actor.type = "Player Character"; }, deps => { deps.actor.pack = "pack"; }, deps => { deps.actor.parent = {}; }]) {
    const deps = fixture();
    mutation(deps);
    await assert.rejects(editNpc({ uuid: "Actor.npc", name: "X" }, deps), /world NPC/);
  }
});

test("session, active GM, bridge, deletion and source changes during confirmation prevent writes", async () => {
  for (const mutation of [
    deps => { deps.game.user.isActiveGM = false; }, deps => { deps.game.user.isGM = false; },
    deps => { deps.game.settings.get = () => false; }, deps => { deps.game.socket.connected = false; },
    deps => { deps.game.world.id = "other"; }, deps => { deps.game.user.id = "other"; },
    deps => { deps.game.system.version = "0.9.4"; }, deps => { deps.source.system.details.level = 6; },
    deps => { deps.game.actors.delete("npc"); }
  ]) {
    const deps = fixture();
    deps.confirm = async () => {
      mutation(deps);
      return true;
    };
    await assert.rejects(editNpc({ uuid: "Actor.npc", name: "Other" }, deps));
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  let connected = true;
  deps.assertConnection = () => {
    if (!connected) {
      throw new Error("Disconnected");
    }
  };
  deps.confirm = async () => { connected = false; return true; };
  await assert.rejects(editNpc({ uuid: "Actor.npc", name: "Other" }, deps), /Disconnected/);
  assert.equal(deps.calls.length, 0);
});

test("reports partial outcomes when embedded edits succeed but actor update fails", async () => {
  const deps = fixture();
  deps.actor.update = async () => { throw new Error("Server unavailable"); };
  const result = await editNpc({ uuid: "Actor.npc", name: "Other", items: [{ id: "claw", type: "power", name: "Rake" }] }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 1);
  assert.equal(deps.source.name, "Troll");
  assert.equal(deps.item.source.name, "Rake");
});

test("cancelled embedded updates do not report success or proceed to actor changes", async () => {
  const deps = fixture();
  deps.actor.updateEmbeddedDocuments = async () => [];
  const result = await editNpc({ uuid: "Actor.npc", name: "Other", items: [{ id: "claw", type: "power", name: "Rake" }] }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 0);
  assert.equal(deps.calls.length, 0);
});

test("allows only one pending confirmation and releases it after cancellation", async () => {
  const deps = fixture();
  let cancel;
  deps.confirm = () => new Promise(resolve => { cancel = resolve; });
  const first = editNpc({ uuid: "Actor.npc", name: "Other" }, deps);
  await assert.rejects(editNpc({ uuid: "Actor.npc", name: "Other" }, deps), /awaiting confirmation/);
  cancel(false);
  assert.equal((await first).status, "cancelled");
  deps.confirm = async () => true;
  assert.equal((await editNpc({ uuid: "Actor.npc", name: "Other" }, deps)).status, "updated");
  assert.equal((await editNpc({ uuid: "Actor.npc", name: "Other" }, deps)).status, "unchanged");
  assert.equal(deps.calls.length, 1);
});

test("popup escapes game content and supports confirm, cancel, close, and expiry", async () => {
  for (const action of ["confirm", "cancel", "close", "expire"]) {
    let options;
    class Dialog {
      constructor(data) { options = data; }
      render() {
        assert.equal(options.default, "cancel");
        assert.ok(!options.content.includes("<script>"));
        assert.ok(options.content.includes("&lt;script&gt;"));
        if (action === "close") {
          options.close();
        } else if (action !== "expire") {
          options.buttons[action].callback();
          options.close();
        }
      }
      close() { options.close(); }
    }
    const answer = await confirmNpcEdit({ name: "<script>", changes: [{ document: "Troll", path: "name", before: "Old", after: "<script>" }] }, { Dialog, timeoutMs: 5 });
    assert.equal(answer, action === "confirm");
  }
});

test("GM-approved hitMark adds a native mark with source identity and correct next-turn expiry, safely reusing retries", async () => {
  const deps = fixture();
  deps.confirm = async ({ changes }) => {
    assert.equal(deps.calls.length, 0);
    assert.equal(changes.length, 1);
    assert.match(changes[0].after, /On hit: Marked/);
    return true;
  };
  const args = { uuid: "Actor.npc", items: [{ id: "claw", type: "power", hitMark: true }] };
  assert.equal((await editNpc(args, deps)).status, "updated");
  const source = deps.calls[0].data[0];
  assert.equal(deps.calls[0].effectType, "ActiveEffect");
  assert.deepEqual(source.statuses, ["mark"]);
  assert.equal(source.system.powerEffectType, "hit");
  assert.equal(source.system.durationType, "endOfUserTurn");
  assert.equal(source.system.useSourceActorData, true);
  assert.deepEqual(source.system.changes, [{ key: "system.marker", type: "override", value: "@charaUID", priority: null }]);
  assert.equal(source.flags[MODULE_ID].hitMark, true);
  assert.equal(source.transfer, false);
  assert.equal(deps.item.source.effects.length, 2);
  assert.equal((await editNpc(args, { ...deps, game: { ...deps.game } })).status, "unchanged");
  assert.equal(deps.calls.length, 1);
});

test("hitMark respects cancellation and rejects caller effects, false, feature targets and altered managed marks", async () => {
  const args = { uuid: "Actor.npc", items: [{ id: "claw", type: "power", hitMark: true }] };
  const deps = fixture();
  deps.confirm = async () => false;
  assert.equal((await editNpc(args, deps)).status, "cancelled");
  assert.equal(deps.calls.length, 0);
  for (const item of [
    { id: "claw", type: "feature", hitMark: true },
    { id: "claw", type: "power", hitMark: false },
    { id: "claw", type: "power", hitMark: true, effects: [] }
  ]) {
    await assert.rejects(editNpc({ uuid: "Actor.npc", items: [item] }, deps));
  }
  deps.confirm = async () => true;
  await editNpc(args, deps);
  deps.calls[0].data[0].system.powerEffectType = "all";
  await assert.rejects(editNpc(args, deps), /was changed/);
  assert.equal(deps.calls.length, 1);
});

test("cancelled mark creation reports incomplete and cannot claim a saved effect", async () => {
  const deps = fixture();
  deps.item.createEmbeddedDocuments = async () => [];
  const result = await editNpc({ uuid: "Actor.npc", items: [{ id: "claw", type: "power", hitMark: true }] }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 0);
});
