import { MAX_MESSAGE_BYTES, MODULE_ID } from "../shared/protocol.js";
import { validateJournalPageEdit } from "../shared/journal-page-data.js";
import { canonical } from "./creation-utils.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();

/**
 * Review scoped world journal page edits, preserving unrelated pages and metadata.
 * Completed receipts and per-addition markers protect retries after partial saves.
 */
export async function editJournalPages(args, {
  game = globalThis.game, CONST = globalThis.CONST, crypto = globalThis.crypto,
  confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validateJournalPageEdit(args);
  args = structuredClone(args);
  if (new TextEncoder().encode(JSON.stringify(args)).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("Journal page edit exceeds 2 MiB.");
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  const journal = game.journal.get(args.uuid.split(".")[1]);
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || !journal || journal.uuid !== args.uuid || journal.pack || journal.parent
      || game.journal.get(journal.id) !== journal) {
      throw new Error("Journal edits require an existing world journal and the paired active GM.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another journal page edit is in progress.");
  }
  pending.add(game);
  const applied = [];
  let writing = false;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(args))));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    assertSession();
    const key = `${userId}_${args.requestId}`;
    const receipt = journal.getFlag(MODULE_ID, "pageEdits")?.[key];
    if (receipt) {
      if (receipt.hash !== hash) {
        throw new Error("Request ID already used with different page data.");
      }
      return { uuid: journal.uuid, status: "unchanged", reused: true, applied: receipt.applied };
    }
    const snapshot = JSON.stringify(journal.toObject(true));
    const additions = [];
    const updates = [];
    const removals = [];
    const sources = new Map();
    const changes = [];
    for (const [index, page] of (args.add ?? []).entries()) {
      const matches = [...journal.pages.values()].filter(candidate => {
        const marker = candidate.getFlag(MODULE_ID, "pageAddition");
        return marker?.key === key && marker.index === index;
      });
      if (matches.length) {
        if (matches.length !== 1 || matches[0].getFlag(MODULE_ID, "pageAddition").hash !== hash) {
          throw new Error("Request ID already used with different page data.");
        }
        applied.push({ action: "add", id: matches[0].id, uuid: matches[0].uuid });
        continue;
      }
      additions.push({ name: page.name, type: "text",
        sort: Math.max(0, ...[...journal.pages.values()].map(existing => existing.sort ?? 0)) + (index + 1) * 100000,
        text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: page.content },
        flags: { [MODULE_ID]: { pageAddition: { key, index, hash } } } });
      changes.push({ document: page.name, path: "Add text page", before: null, after: page });
    }
    for (const input of args.update ?? []) {
      const page = journal.pages.get(input.id);
      if (!page || page.type !== "text") {
        throw new Error("Updates require an existing text page ID in this journal.");
      }
      const patch = { _id: page.id };
      sources.set(page.id, JSON.stringify(page.toObject(true)));
      for (const field of ["name", "content"]) {
        const before = field === "name" ? page.name : page.text.content;
        if (input[field] !== undefined && (before !== input[field]
          || field === "content" && page.text.format !== CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML)) {
          patch[field === "name" ? "name" : "text.content"] = input[field];
          if (field === "content") {
            patch["text.format"] = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;
          }
          changes.push({ document: page.name, path: field, before, after: input[field] });
        }
      }
      if (Object.keys(patch).length > 1) {
        updates.push(patch);
      }
    }
    for (const id of args.remove ?? []) {
      const page = journal.pages.get(id);
      if (page) {
        sources.set(id, JSON.stringify(page.toObject(true)));
        removals.push(id);
        changes.push({ document: page.name, path: "Remove page", before: page.toObject(true), after: null });
      }
    }
    if (changes.length) {
      const approved = await confirm({ name: journal.name, summary: args.summary, changes,
        title: "Foundry MCP: Confirm journal page changes" });
      assertSession();
      if (!approved) {
        return { uuid: journal.uuid, status: "cancelled", applied: [] };
      }
      if (snapshot !== JSON.stringify(journal.toObject(true))) {
        throw new Error("Journal source changed during review; read it and propose again.");
      }
    }
    writing = true;
    for (const data of additions) {
      assertSession();
      const created = await journal.createEmbeddedDocuments("JournalEntryPage", [data], { renderSheet: false });
      assertSession();
      if (created.length !== 1) {
        throw new Error("Page creation was cancelled.");
      }
      applied.push({ action: "add", id: created[0].id, uuid: created[0].uuid });
    }
    for (const patch of updates) {
      assertSession();
      if (sources.get(patch._id) !== JSON.stringify(journal.pages.get(patch._id)?.toObject(true))) {
        throw new Error("Page source changed before update; read it and propose again.");
      }
      const updated = await journal.updateEmbeddedDocuments("JournalEntryPage", [patch]);
      assertSession();
      if (updated.length !== 1) {
        throw new Error("Page update was cancelled.");
      }
      applied.push({ action: "update", id: patch._id });
    }
    for (const id of removals) {
      assertSession();
      if (sources.get(id) !== JSON.stringify(journal.pages.get(id)?.toObject(true))) {
        throw new Error("Page source changed before deletion; read it and propose again.");
      }
      const deleted = await journal.deleteEmbeddedDocuments("JournalEntryPage", [id]);
      assertSession();
      if (deleted.length !== 1) {
        throw new Error("Page deletion was cancelled.");
      }
      applied.push({ action: "remove", id });
    }
    await journal.setFlag(MODULE_ID, `pageEdits.${key}`, { hash, applied });
    assertSession();
    return { uuid: journal.uuid, status: changes.length ? "updated" : "unchanged", applied };
  } catch (error) {
    if (writing) {
      return { uuid: journal.uuid, status: "incomplete", applied,
        message: "Some changes may have saved. Read journal source before retrying identical arguments.", error: error.message };
    }
    throw error;
  } finally {
    pending.delete(game);
  }
}
