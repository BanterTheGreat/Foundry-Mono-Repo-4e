import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const fixturesSource = readFileSync(new URL("../../src/foundry-test-harness/scripts/fixtures.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const harnessSource = readFileSync(new URL("../../src/foundry-test-harness/scripts/main.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace(/import\.meta\.url/g, '"http://localhost/modules/foundry-test-harness/scripts/main.js"');

/** Exercise the fixture boundary without starting a Foundry client or touching world data. */
function fixture() {
  const documents = new Map();
  const hooks = new Map();
  let created = 0;
  const game = {
    ready: true, world: { id: "test-world" }, system: { id: "dnd4e", version: "0.9.3" },
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    settings: { get: () => "test-world" }, modules: { get: id => documents.get(id) },
  };
  const context = vm.createContext({
    game, console, URL,
    foundry: { utils: { randomID: () => "run-id" } },
    Actor: { async create() {
      created++;
      return { uuid: "Actor.fixture", getFlag: () => "run-id", async delete() {} };
    } },
    Hooks: { once: (key, fn) => { hooks.set(key, fn); return fn; }, off: key => hooks.delete(key) },
  });
  vm.runInContext(`${fixturesSource}\nglobalThis.documents = new TestDocuments(); globalThis.guard = assertTestWorld;`, context);
  return { context, game, hooks, documents, created: () => created };
}

test("Foundry fixtures refuse wrong worlds, non-GMs, inactive GMs, and unsupported systems", async () => {
  for (const mutate of [
    game => { game.world.id = "campaign"; },
    game => { game.user.isGM = false; },
    game => { game.users.activeGM.id = "other-gm"; },
    game => { game.system.version = "0.9.4"; },
    game => { game.ready = false; },
  ]) {
    const state = fixture();
    mutate(state.game);
    await assert.rejects(state.context.documents.createActor());
    assert.equal(state.created(), 0);
  }
});

test("cleanup deletes only owned fixtures and retains failed documents for recovery", async () => {
  const { context } = fixture();
  const owned = await context.documents.createActor();
  let deleted = false;
  owned.delete = async () => { deleted = true; };
  const foreign = { uuid: "Actor.foreign", getFlag: () => "another-run", delete: async () => assert.fail("Must not delete foreign data") };
  context.documents.documents.push(foreign);
  await assert.rejects(context.documents.cleanup(), /Fixture ownership changed/);
  assert.equal(deleted, true);
  assert.equal(context.documents.documents.length, 1);
  assert.equal(context.documents.documents[0], foreign);
});

test("harness waits for the report rather than runBatches startup and rejects overlapping runs", async () => {
  const { context, documents, hooks } = fixture();
  documents.set("foundry-test-harness", { version: "0.1.0", api: { ready: true } });
  let rendered = false;
  context.quench = { app: { async render() { rendered = true; } }, async runBatches(keys) {
    assert.equal(rendered, true, "Quench's reporter needs its rendered UI before starting");
    assert.deepEqual(Array.from(keys), ["foundry-test-harness.runtime"]);
    return { started: true };
  } };
  vm.runInContext(harnessSource + "\nglobalThis.runTests = run;", context);
  let settled = false;
  const pending = context.runTests().then(result => { settled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  await assert.rejects(context.runTests(), /already active/);
  hooks.get("quenchReports")({ json: JSON.stringify({ stats: { tests: 1, failures: 0 } }) });
  const result = await pending;
  assert.equal(result.report.stats.tests, 1);
  assert.equal(result.environment.worldId, "test-world");
});

test("a Quench startup failure rejects and removes the report listener", async () => {
  const { context, documents, hooks } = fixture();
  documents.set("foundry-test-harness", { api: { ready: true } });
  context.quench = { app: { async render() {} }, async runBatches() { throw new Error("Runner failed"); } };
  vm.runInContext(harnessSource + "\nglobalThis.runTests = run;", context);
  await assert.rejects(context.runTests(), /Runner failed/);
  assert.equal(hooks.has("quenchReports"), false);
});
