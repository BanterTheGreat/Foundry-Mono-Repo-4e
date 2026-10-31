import { MODULE_ID } from "../shared/protocol.js";
import { BRIEFING_MODULE_ID, BRIEFING_FOLDER, validateJournalRequest } from "../shared/journal-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical, resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakMap();

/**
 * Create a private world JournalEntry with persisted and concurrent retry protection.
 * Briefing data matches the health-display preset reader without changing a combat.
 */
export async function createJournal(args, {
  game = globalThis.game, JournalEntry = globalThis.JournalEntry, Folder = globalThis.Folder,
  CONST = globalThis.CONST, crypto = globalThis.crypto, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validateJournalRequest(args);
  // Snapshot caller data before asynchronous validation and document creation.
  args = JSON.parse(JSON.stringify(args));
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (game.world.id !== worldId || game.user.id !== userId || !game.user.isActiveGM) {
      throw new Error("Journal creation requires the paired active GM.");
    }
    if (args.battleBriefing) {
      if (!game.modules.get(BRIEFING_MODULE_ID)?.active) {
        throw new Error("Battle Briefing presets require active DnD4e Info Displays.");
      }
      const ids = [...(args.battleBriefing.expectedCombatants ?? []).map(entry => entry.actorId),
        ...(args.battleBriefing.strategy?.pointers ?? []).flatMap(pointer => pointer.actorIds)];
      if (ids.some(id => !game.actors.get(id) || game.actors.get(id).pack || game.actors.get(id).parent)) {
        throw new Error("Briefing actors must exist in the current world.");
      }
    }
  };
  assertSession();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(args))));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  assertSession();
  let requests = pending.get(game);
  if (!requests) {
    requests = new Map();
    pending.set(game, requests);
  }
  const key = `${userId}:${args.requestId}`;
  const inFlight = requests.get(key);
  if (inFlight) {
    if (inFlight.hash !== hash) {
      throw new Error("Request ID already used with different journal data or destination.");
    }
    const result = await inFlight.promise;
    assertSession();
    return { ...result, reused: true };
  }
  const promise = (async () => {
    const existing = Array.from(game.journal.values()).filter(entry => {
      const marker = entry.getFlag(MODULE_ID, "creationRequest");
      return marker?.id === args.requestId && marker.userId === userId;
    });
    if (existing.length) {
      const entry = existing[0];
      const marker = entry.getFlag(MODULE_ID, "creationRequest");
      if (existing.length !== 1 || marker.operation !== "create_journal" || marker.hash !== hash || entry.pack || entry.parent) {
        throw new Error("Request ID already used with different journal data or destination.");
      }
      return journalResult(entry, true);
    }
    const folder = await resolveCreationFolder(game, args.battleBriefing ? BRIEFING_FOLDER : args.folder,
      Folder, assertSession, "JournalEntry");
    assertSession();
    // The briefing UI selects the first folder with this name. Reject ambiguous
    // folders rather than silently creating an invisible preset.
    if (args.battleBriefing && Array.from(game.folders.values())
      .filter(candidate => candidate.type === "JournalEntry" && candidate.name === BRIEFING_FOLDER).length !== 1) {
      throw new Error("Battle Briefings folder is ambiguous.");
    }
    const flags = { [MODULE_ID]: { creationRequest: { id: args.requestId, userId, hash, operation: "create_journal" } } };
    let pages = args.pages;
    if (args.battleBriefing) {
      const preset = args.battleBriefing;
      flags[BRIEFING_MODULE_ID] = { preset: {
        title: preset.title, commanderSubtitle: preset.commanderSubtitle ?? "",
        commanderPositionX: preset.commanderPositionX ?? 50, commanderPositionY: preset.commanderPositionY ?? 50,
        commanderZoom: preset.commanderZoom ?? 100,
        expectedCombatants: (preset.expectedCombatants ?? []).map(entry => ({ ...entry, name: game.actors.get(entry.actorId).name })),
        strategy: { environment: preset.strategy?.environment ?? [],
          pointers: (preset.strategy?.pointers ?? []).map((pointer, index) => ({ ...pointer, id: `mcp-pointer-${index + 1}` })) }
      } };
      pages = [{ name: args.name, content: `<h1>${escapeHtml(preset.title)}</h1>` }];
    }
    const entry = await JournalEntry.create({
      name: args.name, folder: folder.id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags,
      pages: pages.map(page => ({ name: page.name, type: "text",
        text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: page.content } }))
    }, { renderSheet: false });
    assertSession();
    if (!entry) {
      throw new Error("Journal creation was cancelled; inspect the destination before retrying identical data.");
    }
    return journalResult(entry, false);
  })();
  requests.set(key, { hash, promise });
  try {
    return await promise;
  } finally {
    requests.delete(key);
  }
}

/**
 * Return stored identity; full pages and flags are available through get_document.
 */
function journalResult(entry, reused) {
  return { id: entry.id, uuid: entry.uuid, name: entry.name, folder: entry.folder?.id ?? null,
    battleBriefing: Boolean(entry.getFlag(BRIEFING_MODULE_ID, "preset")), reused };
}

/**
 * Briefing fields are plain text, including in the generated journal summary.
 */
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
