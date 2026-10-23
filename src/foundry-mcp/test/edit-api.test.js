import test from "node:test";
import assert from "node:assert/strict";
import { editNpc, confirmNpcEdit } from "../scripts/edit-api.js";
import { MODULE_ID, EDIT_CONFIRM_TIMEOUT_MS, EFFECT_CONFIRM_TIMEOUT_MS } from "../shared/protocol.js";
import { validateNpcEdit } from "../shared/npc-data.js";

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
    createEmbeddedDocuments: async (type, data) => {
      calls.push({ createType: type, data: structuredClone(data) });
      return data.map(input => {
        const id = `power${actor.items.size}`;
        const source = structuredClone(input);
        const item = { id, uuid: `Actor.npc.Item.${id}`, name: source.name,
          type: source.type, parent: actor, source, toObject: () => structuredClone(source) };
        actor.items.set(id, item);
        return item;
      });
    },
    update: async patch => {
      calls.push({ actor: patch });
      apply(source, patch);
      actor.name = source.name;
      return actor;
    },
    deleteEmbeddedDocuments: async (type, ids) => {
      calls.push({ deleteType: type, ids });
      return ids.map(id => {
        const item = actor.items.get(id);
        actor.items.delete(id);
        return item;
      });
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

/**
 * Add an independent trait with source data for deletion/approval tests.
 */
function addTrait(deps, id = "trait") {
  const source = { name: `Trait ${id}`, type: "feature", system: { featureType: "trait", description: { value: "<p>Passive rules.</p>" } }, effects: [] };
  const trait = { id, uuid: `Actor.npc.Item.${id}`, name: source.name, type: "feature", parent: deps.actor, toObject: () => structuredClone(source) };
  deps.actor.items.set(id, trait);
  return { trait, source };
}

const fireAddition = { key: "alchemists-fire", name: "Alchemist's Fire", system: {
  actionType: "standard", useType: "atwill", rangeType: "rangeBurst", rangePower: "10", area: "1",
  attack: { isAttack: true, formula: "14", def: "ref" },
  hit: { isDamage: true, formula: "3d6", critFormula: "18" }, miss: { halfDamage: true },
  damageType: { fire: true }, description: { chat: "A flask bursts into flame." }
} };

test("GM-reviewed new powers preserve existing attacks and reuse semantic keys across reloads", async () => {
  const deps = fixture();
  const original = deps.item.toObject();
  deps.confirm = async report => {
    assert.equal(deps.calls.length, 0);
    assert.deepEqual(report.changes[0].after.system, fireAddition.system);
    return true;
  };
  const args = { uuid: "Actor.npc", addPowers: [fireAddition] };
  const result = await editNpc(args, deps);
  assert.equal(result.status, "updated");
  assert.equal(result.addedPowers.length, 1);
  assert.equal(deps.actor.items.size, 2);
  assert.deepEqual(deps.item.toObject(), original);
  assert.deepEqual(deps.actor.items.get(result.addedPowers[0].id).source.system, fireAddition.system);
  deps.game = { ...deps.game };
  deps.confirm = async () => { assert.fail("Saved addition must not prompt again"); };
  assert.equal((await editNpc(args, deps)).status, "unchanged");
  await assert.rejects(editNpc({ ...args, addPowers: [{ ...fireAddition, name: "Changed" }] }, deps), /different data/);
});

test("new powers require approval and an unchanged, active world NPC", async () => {
  for (const mode of ["cancel", "stale", "session", "pc", "compendium", "token"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") {
        deps.source.name = "Changed manually";
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      return mode !== "cancel";
    };
    if (mode === "pc") {
      deps.actor.type = "Player Character";
    }
    if (mode === "compendium") {
      deps.actor.pack = "monsters";
    }
    if (mode === "token") {
      deps.actor.parent = {};
    }
    try {
      assert.equal((await editNpc({ uuid: "Actor.npc", addPowers: [fireAddition] }, deps)).status, "cancelled");
    } catch (error) {
      assert.match(error.message, /changed|active GM|world NPC/);
    }
    assert.equal(deps.calls.length, 0);
  }
});

test("partial power additions resume safely after a saved creation loses its response", async () => {
  const deps = fixture();
  const create = deps.actor.createEmbeddedDocuments;
  deps.actor.createEmbeddedDocuments = async (...args) => { await create(...args); throw new Error("Lost response"); };
  const args = { uuid: "Actor.npc", addPowers: [fireAddition, { ...fireAddition, key: "second-flask", name: "Second Flask" }] };
  const partial = await editNpc(args, deps);
  assert.equal(partial.status, "incomplete");
  assert.equal(partial.addedPowers.length, 1);
  deps.actor.createEmbeddedDocuments = create;
  assert.equal((await editNpc(args, deps)).status, "updated");
  assert.equal(deps.actor.items.size, 3);
});

test("silently cancelled power creation reports incomplete and permits an approved retry", async () => {
  const deps = fixture();
  const create = deps.actor.createEmbeddedDocuments;
  deps.actor.createEmbeddedDocuments = async () => [];
  const args = { uuid: "Actor.npc", addPowers: [fireAddition] };
  assert.equal((await editNpc(args, deps)).status, "incomplete");
  deps.actor.createEmbeddedDocuments = create;
  assert.equal((await editNpc(args, deps)).status, "updated");
});

test("power additions compose with actor edits, existing power edits and trait deletion", async () => {
  const deps = fixture();
  addTrait(deps);
  const result = await editNpc({ uuid: "Actor.npc", system: { biography: "One flask." },
    items: [{ id: "claw", type: "power", system: { attack: { formula: "11" } } }],
    addPowers: [fireAddition], deleteTraits: ["trait"] }, deps);
  assert.equal(result.status, "updated");
  assert.equal(deps.source.system.biography, "One flask.");
  assert.equal(deps.item.source.system.attack.formula, "11");
  assert.equal(deps.actor.items.has("trait"), false);
  assert.equal(result.addedPowers.length, 1);
});

test("duplicate persisted power receipts fail closed", async () => {
  const deps = fixture();
  const args = { uuid: "Actor.npc", addPowers: [fireAddition] };
  const result = await editNpc(args, deps);
  const saved = deps.actor.items.get(result.addedPowers[0].id);
  deps.actor.items.set("duplicate", { ...saved, id: "duplicate" });
  await assert.rejects(editNpc(args, deps), /duplicate receipts/);
});

test("new powers reject caller source, effects, IDs, duplicate keys and missing data", () => {
  for (const addPowers of [[{ ...fireAddition, flags: {} }], [{ ...fireAddition, effects: [] }],
    [{ ...fireAddition, id: "invented" }], [{ ...fireAddition, type: "feature" }],
    [fireAddition, fireAddition], [{ ...fireAddition, key: "" }],
    [{ ...fireAddition, name: "" }], [{ ...fireAddition, system: undefined }],
    [{ ...fireAddition, system: { macros: [] } }], Array(101).fill(fireAddition)]) {
    assert.throws(() => validateNpcEdit({ uuid: "Actor.npc", addPowers }));
  }
});

test("trait deletion shows full source before confirmation, preserves other items, and safely retries", async () => {
  const deps = fixture();
  const { source } = addTrait(deps);
  deps.confirm = async ({ changes }) => {
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.actor.items.has("trait"), true);
    assert.deepEqual(changes, [{ document: "Trait trait", uuid: "Actor.npc.Item.trait", path: "items: delete trait", before: source, after: "(deleted)" }]);
    return true;
  };
  const args = { uuid: "Actor.npc", deleteTraits: ["trait"] };
  assert.equal((await editNpc(args, deps)).status, "updated");
  assert.deepEqual(deps.calls, [{ deleteType: "Item", ids: ["trait"] }]);
  assert.equal(deps.actor.items.has("trait"), false);
  assert.equal(deps.actor.items.has("claw"), true);
  deps.confirm = async () => { assert.fail("Already deleted traits must not prompt"); };
  assert.equal((await editNpc(args, deps)).status, "unchanged");
});

test("trait deletion cancellation, stale source, session changes and malformed requests never delete", async () => {
  for (const change of ["cancel", "source", "session", "removed"]) {
    const deps = fixture();
    const { source } = addTrait(deps);
    deps.confirm = async () => {
      if (change === "source") {
        source.system.description.value = "Changed manually";
      }
      if (change === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (change === "removed") {
        deps.actor.items.delete("trait");
      }
      return change !== "cancel";
    };
    const operation = editNpc({ uuid: "Actor.npc", deleteTraits: ["trait"] }, deps);
    if (change === "cancel") {
      assert.equal((await operation).status, "cancelled");
    } else {
      await assert.rejects(operation);
    }
    assert.equal(deps.calls.length, 0);
  }
  for (const args of [
    { deleteTraits: ["claw"] },
    { deleteTraits: ["trait", "trait"] },
    { deleteTraits: ["trait"], items: [{ id: "trait", type: "feature", name: "Other" }] },
    { deleteTraits: [42] }, { deleteTraits: "trait" },
    { deleteTraits: ["Actor.npc.Item.trait"] }, { deleteTraits: Array(101).fill("trait") }
  ]) {
    const deps = fixture();
    addTrait(deps);
    deps.confirm = async () => { assert.fail("Invalid deletions must not prompt"); };
    await assert.rejects(editNpc({ uuid: "Actor.npc", ...args }, deps));
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  const { source } = addTrait(deps);
  source.system.featureType = "feat";
  await assert.rejects(editNpc({ uuid: "Actor.npc", deleteTraits: ["trait"] }, deps), /traits/);
});

test("trait deletion reports partial/cancelled writes and only retries remaining IDs", async () => {
  const deps = fixture();
  addTrait(deps, "first");
  addTrait(deps, "second");
  const args = { uuid: "Actor.npc", system: { biography: "Preserved rules" }, deleteTraits: ["first", "second"] };
  deps.actor.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(deps.source.system.biography, "Preserved rules");
    deps.actor.items.delete(ids[0]);
    throw new Error("Disconnected after first deletion");
  };
  const result = await editNpc(args, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied.map(change => change.path), ["system.biography", "items: delete trait"]);
  deps.actor.deleteEmbeddedDocuments = async (type, ids) => {
    assert.deepEqual(ids, ["second"]);
    return [];
  };
  assert.equal((await editNpc(args, deps)).status, "incomplete");
  deps.actor.deleteEmbeddedDocuments = async (type, ids) => {
    assert.deepEqual(ids, ["second"]);
    deps.actor.items.delete("second");
  };
  assert.equal((await editNpc(args, deps)).status, "updated");
});

test("updates cannot delete a trait changed by an update hook after approval", async () => {
  const deps = fixture();
  const { source } = addTrait(deps);
  const update = deps.actor.update;
  deps.actor.update = async patch => {
    const result = await update(patch);
    source.system.description.value = "Changed by hook";
    return result;
  };
  const result = await editNpc({ uuid: "Actor.npc", name: "Other", deleteTraits: ["trait"] }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(deps.actor.items.has("trait"), true);
  assert.equal(deps.calls.length, 1);
});

test("a silently cancelled Lore update cannot proceed to trait deletion", async () => {
  const deps = fixture();
  addTrait(deps);
  deps.actor.update = async () => deps.actor;
  const result = await editNpc({ uuid: "Actor.npc", system: { biography: "Preserve this first" }, deleteTraits: ["trait"] }, deps);
  assert.equal(result.status, "incomplete");
  assert.equal(deps.actor.items.has("trait"), true);
  assert.equal(deps.calls.length, 0);
});

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

test("all edit dialogs allow two minutes and put escaped summary before detailed changes", async t => {
  assert.equal(EDIT_CONFIRM_TIMEOUT_MS, 120000);
  assert.equal(EFFECT_CONFIRM_TIMEOUT_MS, EDIT_CONFIRM_TIMEOUT_MS);
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  let options;
  class Dialog {
    constructor(data) { options = data; }
    render() {}
    close() { options.close(); }
  }
  const request = { name: "Troll", summary: "Update <script> Lore.", changes: [{ document: "Troll", path: "system.biography", before: "old", after: "new" }] };
  const first = confirmNpcEdit(request, { Dialog });
  assert.ok(options.content.indexOf("Update &lt;script&gt; Lore.") < options.content.indexOf("Detailed changes"));
  assert.match(options.content, /2 minutes/);
  assert.ok(!options.content.includes("<script>"));
  t.mock.timers.tick(119999);
  options.buttons.confirm.callback();
  assert.equal(await first, true);
  const expired = confirmNpcEdit(request, { Dialog });
  t.mock.timers.tick(120000);
  options.buttons.confirm.callback();
  assert.equal(await expired, false);
});

test("delayed browser timers cannot approve after the two-minute deadline", async () => {
  let options;
  let clock = 0;
  class Dialog {
    constructor(data) { options = data; }
    render() { clock = 120001; options.buttons.confirm.callback(); }
  }
  assert.equal(await confirmNpcEdit({ name: "Troll", changes: [] }, { Dialog, now: () => clock }), false);
});

test("edit summary is review text only and never becomes an Actor update", async () => {
  const deps = fixture();
  deps.confirm = async ({ summary }) => {
    assert.equal(summary, "Rename the troll.");
    return true;
  };
  assert.equal((await editNpc({ uuid: "Actor.npc", name: "Other", summary: "Rename the troll." }, deps)).status, "updated");
  assert.deepEqual(deps.calls, [{ actor: { name: "Other" } }]);
  for (const summary of [" ", "x".repeat(1001), 42]) {
    await assert.rejects(editNpc({ uuid: "Actor.npc", name: "X", summary }, deps));
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
