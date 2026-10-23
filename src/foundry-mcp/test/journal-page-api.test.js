import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { editJournalPages } from "../scripts/journal-page-api.js";
import { validateJournalPageEdit } from "../shared/journal-page-data.js";

/**
 * Exercise embedded page APIs, stored receipts and review-time mutations.
 */
function fixture() {
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    world: { id: "world" }, user: { id: "gm", isGM: true, isActiveGM: true }, journal: new Map() };
  const pages = new Map();
  const flags = {};
  let serial = 0;
  const wrap = data => {
    const source = structuredClone(data);
    return { ...source, id: source._id, uuid: `JournalEntry.book.JournalEntryPage.${source._id}`,
      toObject: () => structuredClone(source), getFlag: (module, key) => source.flags?.[module]?.[key] };
  };
  const journal = { id: "book", uuid: "JournalEntry.book", name: "Encounters", pages,
    getFlag: (module, key) => flags[module]?.[key],
    toObject: () => ({ pages: [...pages.values()].map(page => page.toObject()), flags: structuredClone(flags) }),
    createEmbeddedDocuments: async (type, data) => data.map(page => {
      assert.equal(type, "JournalEntryPage");
      const created = wrap({ ...page, _id: `new${++serial}` });
      pages.set(created.id, created);
      return created;
    }),
    updateEmbeddedDocuments: async (type, data) => data.map(patch => {
      const source = pages.get(patch._id).toObject();
      if (patch.name !== undefined) {
        source.name = patch.name;
      }
      for (const field of ["content", "format"]) {
        if (patch[`text.${field}`] !== undefined) {
          source.text[field] = patch[`text.${field}`];
        }
      }
      const updated = wrap(source);
      pages.set(updated.id, updated);
      return updated;
    }),
    deleteEmbeddedDocuments: async (type, ids) => ids.map(id => {
      const page = pages.get(id);
      pages.delete(id);
      return page;
    }),
    setFlag: async (module, path, value) => {
      const [field, key] = path.split(".");
      flags[module] ??= {};
      flags[module][field] ??= {};
      flags[module][field][key] = structuredClone(value);
    }
  };
  pages.set("old", wrap({ _id: "old", name: "Old", type: "text", text: { content: "Old text", format: 1 }, ownership: { default: 0 } }));
  pages.set("keep", wrap({ _id: "keep", name: "Keep", type: "image", src: "image.webp" }));
  game.journal.set("book", journal);
  return { game, journal, crypto: webcrypto, confirm: async () => true,
    CONST: { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } } };
}

const input = { uuid: "JournalEntry.book", requestId: "journal-edit-001",
  add: [{ name: "Grappa's Safehouse", content: "<h2>Move Grappa</h2><p>Haul.</p>" }],
  update: [{ id: "old", name: "Renamed", content: "<p>Revised</p>" }] };

test("adds and edits text pages, preserves other pages and metadata, and prevents completed replay", async () => {
  const deps = fixture();
  let reviews = 0;
  deps.confirm = async report => { reviews++; assert.equal(report.changes.length, 3); return true; };
  const before = deps.journal.pages.get("keep").toObject();
  assert.equal((await editJournalPages(input, deps)).status, "updated");
  assert.equal(deps.journal.pages.size, 3);
  assert.equal(deps.journal.pages.get("new1").text.content, input.add[0].content);
  assert.equal(deps.journal.pages.get("old").name, "Renamed");
  assert.deepEqual(deps.journal.pages.get("old").ownership, { default: 0 });
  assert.deepEqual(deps.journal.pages.get("keep").toObject(), before);
  assert.equal((await editJournalPages(input, deps)).reused, true);
  assert.equal(reviews, 1);
  await assert.rejects(editJournalPages({ ...input, add: [{ name: "Other", content: "" }] }, deps), /different page data/);
});

test("removes only selected pages of any type; missing deletion IDs are safe no-ops", async () => {
  const deps = fixture();
  const args = { uuid: input.uuid, requestId: input.requestId, remove: ["keep", "missing"] };
  assert.equal((await editJournalPages(args, deps)).status, "updated");
  assert.deepEqual([...deps.journal.pages.keys()], ["old"]);
  assert.equal((await editJournalPages(args, deps)).status, "unchanged");
});

test("cancellation, stale source, revoked session and non-world journals prevent writes", async () => {
  for (const change of [
    deps => { deps.confirm = async () => false; },
    deps => { deps.confirm = async () => { deps.journal.name = "changed"; deps.journal.pages.clear(); return true; }; },
    deps => { deps.confirm = async () => { deps.game.user.isActiveGM = false; return true; }; },
    deps => { deps.journal.pack = "compendium"; },
    deps => { deps.assertConnection = () => { throw new Error("Disconnected"); }; }
  ]) {
    const deps = fixture();
    let writes = 0;
    deps.journal.createEmbeddedDocuments = async () => { writes++; };
    change(deps);
    try {
      const result = await editJournalPages(input, deps);
      assert.equal(result.status, "cancelled");
    } catch (error) {
      assert.match(error.message, /changed|active GM|Disconnected/);
    }
    assert.equal(writes, 0);
  }
});

test("uncertain additions survive reload and resume without duplicate pages", async () => {
  const deps = fixture();
  const create = deps.journal.createEmbeddedDocuments;
  deps.journal.createEmbeddedDocuments = async (...args) => { await create(...args); throw new Error("Lost response"); };
  assert.equal((await editJournalPages(input, deps)).status, "incomplete");
  deps.journal.createEmbeddedDocuments = create;
  deps.game = { ...deps.game };
  await assert.rejects(editJournalPages({ ...input, add: [{ name: "Changed", content: "" }] }, deps), /different page data/);
  assert.equal((await editJournalPages(input, deps)).status, "updated");
  assert.equal(deps.journal.pages.size, 3);
});

test("rejects arbitrary fields, wrong targets, empty edits, conflicting IDs and non-text updates", async () => {
  for (const args of [{ ...input, flags: {} }, { ...input, uuid: "Actor.pc" },
    { uuid: input.uuid, requestId: input.requestId }, { ...input, remove: ["old"] },
    { ...input, add: [{ name: "Empty" }] }, { ...input, update: [{ id: "old" }] },
    { ...input, update: [{ id: "old", content: "x", ownership: {} }] }]) {
    assert.throws(() => validateJournalPageEdit(args));
  }
  const deps = fixture();
  await assert.rejects(editJournalPages({ ...input, update: [{ id: "keep", content: "text" }] }, deps), /text page/);
});

test("intervening hooks cannot change the next deletion target after approval", async () => {
  const deps = fixture();
  const create = deps.journal.createEmbeddedDocuments;
  deps.journal.createEmbeddedDocuments = async (...args) => {
    const created = await create(...args);
    deps.journal.pages.get("keep").toObject = () => ({ name: "Changed by hook" });
    return created;
  };
  const result = await editJournalPages({ ...input, update: [], remove: ["keep"] }, deps);
  assert.equal(result.status, "incomplete");
  assert.match(result.error, /changed before deletion/);
  assert.equal(deps.journal.pages.has("keep"), true);
});

test("concurrent edits are rejected while review is pending and cancellation releases the lock", async () => {
  const deps = fixture();
  let release;
  let started;
  const reviewing = new Promise(resolve => { started = resolve; });
  deps.confirm = () => { started(); return new Promise(resolve => { release = resolve; }); };
  const first = editJournalPages(input, deps);
  await reviewing;
  await assert.rejects(editJournalPages(input, deps), /in progress/);
  release(false);
  assert.equal((await first).status, "cancelled");
  deps.confirm = async () => true;
  assert.equal((await editJournalPages(input, deps)).status, "updated");
});
