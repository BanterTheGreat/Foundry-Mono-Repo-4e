import test from "node:test";
import assert from "node:assert/strict";
import { renameWorldPowers } from "../scripts/world-power-name-api.js";
import { validateWorldPowerNames } from "../shared/world-power-name-data.js";

/** Model stored power documents and capture writes without a running Foundry world. */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, items: new Map() };
  const writes = [];
  for (const id of ["one", "two"]) {
    const source = { name: "Power - Daily", type: "power", system: { uses: { value: 0, max: "1", per: "day" } },
      flags: { original: true }, effects: [{ name: "Dazed" }] };
    const item = { id, uuid: `Item.${id}`, type: "power", get name() { return source.name; }, source,
      toObject: () => structuredClone(source), update: async patch => {
        writes.push(patch);
        Object.assign(source, patch);
      } };
    game.items.set(id, item);
  }
  return { game, writes, confirm: async () => true };
}
const request = { powers: [{ uuid: "Item.one", name: "Deathburst Armor" }, { uuid: "Item.two", name: "Raven Cloak" }] };

test("confirmed names preserve mechanics, usage and identity; retry is a no-op", async () => {
  const deps = fixture();
  const before = deps.game.items.get("one").toObject();
  assert.equal((await renameWorldPowers(request, deps)).status, "updated");
  assert.deepEqual(deps.game.items.get("one").toObject(), { ...before, name: "Deathburst Armor" });
  assert.deepEqual(deps.writes, [{ name: "Deathburst Armor" }, { name: "Raven Cloak" }]);
  deps.confirm = async () => assert.fail("Already renamed");
  assert.equal((await renameWorldPowers(request, deps)).status, "unchanged");
});

test("cancel, stale source, replacement and lost session prevent all writes", async () => {
  for (const mode of ["cancel", "stale", "replacement", "session"]) {
    const deps = fixture();
    deps.confirm = async () => {
      if (mode === "stale") {
        deps.game.items.get("one").source.system.uses.value = 1;
      }
      if (mode === "replacement") {
        deps.game.items.delete("one");
      }
      if (mode === "session") {
        deps.game.user.isActiveGM = false;
      }
      return mode !== "cancel";
    };
    if (mode === "cancel") {
      assert.equal((await renameWorldPowers(request, deps)).status, "cancelled");
    } else {
      await assert.rejects(renameWorldPowers(request, deps));
    }
    assert.equal(deps.writes.length, 0);
  }
});

test("partial failure reports saved names and retry completes only remaining work", async () => {
  const deps = fixture();
  const second = deps.game.items.get("two");
  const update = second.update;
  second.update = async () => { throw new Error("failure"); };
  const result = await renameWorldPowers(request, deps);
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.applied, [{ uuid: "Item.one", name: "Deathburst Armor" }]);
  second.update = update;
  assert.equal((await renameWorldPowers(request, deps)).status, "updated");
  assert.equal(deps.writes.length, 2);
});

test("reject malformed requests and unsupported world documents before review", async () => {
  for (const args of [{ powers: [] }, { powers: [request.powers[0], request.powers[0]] },
    { powers: [{ uuid: "Actor.pc.Item.one", name: "Name" }] },
    { powers: [{ uuid: "Compendium.foo.bar.Item.one", name: "Name" }] },
    { powers: [{ uuid: "Item.one", name: " " }] },
    { powers: [{ uuid: "Item.one", name: "x".repeat(201) }] },
    { ...request, flags: {} }, { powers: [{ ...request.powers[0], system: {} }] }]) {
    assert.throws(() => validateWorldPowerNames(args));
  }
  for (const property of [{ type: "weapon" }, { parent: {} }, { pack: "foo.bar" }]) {
    const deps = fixture();
    Object.assign(deps.game.items.get("one"), property);
    deps.confirm = async () => assert.fail("Unsupported document");
    await assert.rejects(renameWorldPowers(request, deps));
  }
});

test("concurrent review is rejected and names are trimmed", async () => {
  const deps = fixture();
  let finish;
  deps.confirm = () => new Promise(resolve => { finish = resolve; });
  const running = renameWorldPowers({ powers: [{ uuid: "Item.one", name: "  Armor  " }] }, deps);
  await assert.rejects(renameWorldPowers(request, deps), /awaiting confirmation/);
  finish(true);
  assert.equal((await running).status, "updated");
  assert.equal(deps.game.items.get("one").name, "Armor");
});
