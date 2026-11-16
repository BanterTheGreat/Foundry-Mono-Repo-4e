import test from "node:test";
import assert from "node:assert/strict";
import { editItemDescriptions } from "../scripts/item-description-api.js";
import { validateItemDescriptions } from "../shared/item-description-data.js";

/**
 * Model world and merchant Items with independent rules, flavor and mechanics.
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
      description: { value: "Old rules", chat: "Old flavor", gm: "Private" } },
    effects: [{ name: "Effect" }], flags: { original: true } };
    const item = { uuid, parent, type: "weapon", name: source.name, source,
      toObject: () => structuredClone(source), update: async patch => {
        writes.push({ uuid, patch });
        for (const [path, value] of Object.entries(patch)) {
          source.system.description[path.split(".").at(-1)] = value;
        }
      } };
    (parent?.items ?? game.items).set(uuid.split(".").at(-1), item);
  }
  return { game, writes, confirm: async () => true };
}
const request = { items: [
  { uuid: "Item.one", description: { value: "<h2>Rules</h2>", chat: "New flavor" } },
  { uuid: "Actor.merchant.Item.two", description: { value: "<p>Merchant rules</p>" } }
] };

test("world and merchant text updates preserve mechanics, private text, omitted flavor and identity", async () => {
  const deps = fixture();
  const before = deps.game.items.get("one").toObject();
  assert.equal((await editItemDescriptions(request, deps)).status, "updated");
  assert.deepEqual(deps.game.items.get("one").toObject(), {
    ...before, system: { ...before.system, description: { value: "<h2>Rules</h2>", chat: "New flavor", gm: "Private" } }
  });
  assert.equal(deps.game.actors.get("merchant").items.get("two").source.system.description.chat, "Old flavor");
  assert.equal(deps.writes.length, 2);
  deps.confirm = async () => assert.fail("No-op retry must not prompt");
  assert.equal((await editItemDescriptions(request, deps)).status, "unchanged");
});

test("explicit empty text clears only the selected field and PC-owned Items are supported", async () => {
  const deps = fixture();
  const actor = deps.game.actors.get("merchant");
  actor.type = "Player Character";
  const result = await editItemDescriptions({ items: [{ uuid: "Actor.merchant.Item.two", description: { chat: "" } }] }, deps);
  assert.equal(result.status, "updated");
  assert.deepEqual(actor.items.get("two").source.system.description, { value: "Old rules", chat: "", gm: "Private" });
});

test("Foundry expansion of update data does not corrupt post-save verification", async () => {
  const deps = fixture();
  const item = deps.game.items.get("one");
  const update = item.update;
  item.update = async patch => {
    await update(patch);
    patch.system = { description: { value: patch["system.description.value"], chat: patch["system.description.chat"] } };
    delete patch["system.description.value"];
    delete patch["system.description.chat"];
  };
  const result = await editItemDescriptions(request, deps);
  assert.equal(result.status, "updated");
  assert.equal(result.applied.length, 2);
});

test("cancellation, stale Items, actor replacement and session loss prevent writes", async () => {
  for (const mode of ["cancel", "stale", "actor", "session", "connection"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") {
        deps.game.items.get("one").source.system.enhance = 3;
      }
      if (mode === "actor") {
        const actor = deps.game.actors.get("merchant");
        deps.game.actors.set("merchant", { ...actor });
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (mode === "connection") {
        deps.assertConnection = () => { throw new Error("disconnected"); };
        deps.game.socket.connected = false;
      }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await editItemDescriptions(request, deps)).status, "cancelled");
    } else {
      await assert.rejects(editItemDescriptions(request, deps));
    }
    assert.equal(deps.writes.length, 0);
  }
});

test("partial saves report receipts and absolute retries finish remaining Items", async () => {
  const deps = fixture();
  const second = deps.game.actors.get("merchant").items.get("two");
  const update = second.update;
  second.update = async () => { throw new Error("save failed"); };
  const result = await editItemDescriptions(request, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied, [{ uuid: "Item.one", fields: ["system.description.value", "system.description.chat"] }]);
  second.update = update;
  assert.equal((await editItemDescriptions(request, deps)).status, "updated");
  assert.equal(deps.writes.length, 2);
});

test("reject unsupported destinations and arbitrary fields before review", async () => {
  for (const args of [{ items: [] }, { items: [request.items[0], request.items[0]] },
    { items: [{ uuid: "Compendium.pack.Item.one", description: { value: "Text" } }] },
    { items: [{ uuid: "Scene.scene.Token.token.Actor.actor.Item.one", description: { value: "Text" } }] },
    { items: [{ uuid: "Item.one", description: {} }] },
    { items: [{ uuid: "Item.one", description: { value: "x".repeat(50001) } }] },
    { items: [{ uuid: "Item.one", description: { gm: "Private" } }] },
    { ...request, flags: {} }, { items: [{ ...request.items[0], name: "Rename" }] }]) {
    assert.throws(() => validateItemDescriptions(args));
  }
  for (const mode of ["token", "pack", "parent", "type", "missing"]) {
    const deps = fixture();
    const actor = deps.game.actors.get("merchant");
    if (mode === "token") {
      actor.isToken = true;
    }
    if (mode === "pack") {
      actor.pack = "pack";
    }
    if (mode === "parent") {
      deps.game.items.get("one").parent = actor;
    }
    if (mode === "type") {
      deps.game.items.get("one").type = "unsupported";
    }
    if (mode === "missing") {
      deps.game.actors.delete("merchant");
    }
    deps.confirm = async () => assert.fail("Invalid targets must not prompt");
    await assert.rejects(editItemDescriptions(request, deps));
    assert.equal(deps.writes.length, 0);
  }
});

test("review is serialized and caller mutation cannot change approved text", async () => {
  const deps = fixture();
  let finish;
  deps.confirm = () => new Promise(resolve => { finish = resolve; });
  const args = structuredClone(request);
  const running = editItemDescriptions(args, deps);
  args.items[0].description.value = "Changed after review";
  await assert.rejects(editItemDescriptions(request, deps), /awaiting confirmation/);
  finish(true);
  assert.equal((await running).status, "updated");
  assert.equal(deps.game.items.get("one").source.system.description.value, "<h2>Rules</h2>");
});
