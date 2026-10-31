import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createJournal } from "../scripts/journal-create-api.js";
import { validateJournalRequest } from "../shared/journal-data.js";

const args = { requestId: "journal-test-01", name: "Ambush", battleBriefing: {
  title: "Hold <the bridge>",
  expectedCombatants: [{ actorId: "guard", count: 3 }],
  strategy: { environment: ["The bridge is slippery."], pointers: [{ actorIds: ["guard"], notes: ["Defend the gate."] }] }
} };

/**
 * Model journal storage, folder creation, persisted receipts and session changes.
 */
function fixture() {
  const calls = [];
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    world: { id: "world" }, user: { id: "gm", isGM: true, isActiveGM: true },
    journal: new Map(), folders: new Map(), actors: new Map([["guard", { name: "Guard" }]]),
    modules: new Map([["dnd4e-health-display", { active: true }]]) };
  const Folder = { create: async data => {
    const folder = { ...data, id: `folder${game.folders.size}`, folder: game.folders.get(data.folder) ?? null };
    game.folders.set(folder.id, folder);
    return folder;
  } };
  const JournalEntry = { create: async (data, options) => {
    calls.push({ data: structuredClone(data), options });
    const id = `journal${calls.length}`;
    const entry = { ...data, id, uuid: `JournalEntry.${id}`, folder: game.folders.get(data.folder),
      getFlag: (module, key) => data.flags?.[module]?.[key] };
    game.journal.set(id, entry);
    return entry;
  } };
  return { game, Folder, JournalEntry, crypto: webcrypto, calls,
    CONST: { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 }, JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } } };
}

test("creates a private native Battle Briefing preset with reusable actor pointers", async () => {
  const deps = fixture();
  const result = await createJournal(args, deps);
  assert.equal(result.battleBriefing, true);
  assert.equal(result.uuid, "JournalEntry.journal1");
  const { data } = deps.calls[0];
  assert.equal(deps.game.folders.get(data.folder).name, "Battle Briefings");
  assert.deepEqual(data.ownership, { default: 0 });
  assert.equal(data.pages[0].type, "text");
  assert.equal(data.pages[0].text.content, "<h1>Hold &lt;the bridge&gt;</h1>");
  const preset = data.flags["dnd4e-health-display"].preset;
  assert.equal(preset.commanderZoom, 100);
  assert.equal(Object.hasOwn(preset, "description"), false);
  assert.deepEqual(preset.expectedCombatants, [{ actorId: "guard", count: 3, name: "Guard" }]);
  assert.deepEqual(preset.strategy.pointers, [{ id: "mcp-pointer-1", actorIds: ["guard"], notes: ["Defend the gate."] }]);
});

test("ordinary journals preserve named HTML pages and use nested JournalEntry folders", async () => {
  const deps = fixture();
  const input = { requestId: "plain-journal-1", name: "Clues", folder: "Campaign/Clues",
    pages: [{ name: "Letter", content: "<p>A clue.</p>" }, { name: "Witness", content: "Second page" }] };
  const result = await createJournal(input, deps);
  assert.equal(result.battleBriefing, false);
  assert.deepEqual([...deps.game.folders.values()].map(folder => folder.type), ["JournalEntry", "JournalEntry"]);
  assert.deepEqual(deps.calls[0].data.pages.map(page => page.text.content), input.pages.map(page => page.content));
});

test("concurrent and persisted retries create once and reject changed data", async () => {
  const deps = fixture();
  const results = await Promise.all([createJournal(args, deps), createJournal(args, deps)]);
  assert.equal(results[0].uuid, results[1].uuid);
  assert.equal(results[1].reused, true);
  deps.game = { ...deps.game };
  assert.equal((await createJournal(args, deps)).reused, true);
  await assert.rejects(createJournal({ ...args, name: "Changed" }, deps), /different journal data/);
  assert.equal(deps.calls.length, 1);
});

test("validation rejects raw flags, malformed pointers, missing fields and invalid framing", () => {
  for (const input of [{ ...args, flags: {} }, { ...args, folder: "Elsewhere" }, { ...args, pages: [] },
    { ...args, battleBriefing: { title: "" } },
    { ...args, battleBriefing: { ...args.battleBriefing, commanderZoom: 99 } },
    { ...args, battleBriefing: { ...args.battleBriefing, strategy: { pointers: [{}] } } },
    { ...args, battleBriefing: { ...args.battleBriefing, expectedCombatants: [{ actorId: "guard", count: 0 }] } },
    { requestId: "plain-journal", name: "Empty", folder: "Journals", pages: [] }]) {
    assert.throws(() => validateJournalRequest(input));
  }
});

test("rejects missing actors, disabled module, ambiguous folders and revoked sessions before saves", async () => {
  for (const mutate of [
    deps => deps.game.actors.clear(),
    deps => deps.game.modules.clear(),
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.assertConnection = () => { throw new Error("Disconnected"); }; },
    deps => { deps.game.folders = new Map([1, 2].map(id => [id, { id, name: "Battle Briefings", type: "JournalEntry" }])); },
    deps => { const create = deps.Folder.create; deps.Folder.create = async data => {
      const folder = await create(data); deps.game.user.isGM = false; return folder;
    }; }
  ]) {
    const deps = fixture();
    mutate(deps);
    await assert.rejects(createJournal(args, deps));
    assert.equal(deps.calls.length, 0);
  }
});

test("an uncertain save reuses the persisted journal on retry", async () => {
  const deps = fixture();
  const save = deps.JournalEntry.create;
  deps.JournalEntry.create = async (...input) => { await save(...input); throw new Error("Lost response"); };
  await assert.rejects(createJournal(args, deps), /Lost response/);
  assert.equal((await createJournal(args, deps)).reused, true);
  assert.equal(deps.calls.length, 1);
});
