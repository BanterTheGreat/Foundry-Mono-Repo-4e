import { validateShape } from "./npc-data.js";

export const BRIEFING_MODULE_ID = "dnd4e-health-display";
export const BRIEFING_FOLDER = "Battle Briefings";
export const JOURNAL_SCHEMA = {
  requestId: "string", name: "string", folder: "string",
  pages: [{ name: "string", content: "string" }],
  battleBriefing: {
    title: "string", commanderSubtitle: "string",
    commanderPositionX: "number", commanderPositionY: "number", commanderZoom: "number",
    expectedCombatants: [{ actorId: "string", count: "integer" }],
    strategy: { environment: ["string"], pointers: [{ actorIds: ["string"], notes: ["string"] }] }
  }
};

/**
 * Accept descriptive journal content or one structured Battle Briefing preset.
 * Validate independently in the companion and browser; never accept raw flags.
 */
export function validateJournalRequest(args) {
  validateShape(args, JOURNAL_SCHEMA);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")
    || !args.name?.trim() || args.name.length > 200) {
    throw new Error("Supply a unique requestId and journal name of at most 200 characters.");
  }
  if (args.battleBriefing !== undefined) {
    if (args.pages !== undefined || args.folder !== undefined) {
      throw new Error("Battle Briefings use their dedicated folder and generated summary page.");
    }
    const preset = args.battleBriefing;
    if (typeof preset.title !== "string" || !preset.title.trim()) {
      throw new Error("A Battle Briefing requires a nonblank title string.");
    }
    for (const [key, min, max] of [["commanderPositionX", 0, 100], ["commanderPositionY", 0, 100], ["commanderZoom", 100, 200]]) {
      if (preset[key] !== undefined && (preset[key] < min || preset[key] > max)) {
        throw new Error(`Invalid ${key} range.`);
      }
    }
    for (const combatant of preset.expectedCombatants ?? []) {
      validateActorId(combatant.actorId);
      if (!Number.isInteger(combatant.count) || combatant.count < 1 || combatant.count > 1000) {
        throw new Error("Expected combatant counts must be between 1 and 1000.");
      }
    }
    const actorIds = (preset.expectedCombatants ?? []).map(entry => entry.actorId);
    if (new Set(actorIds).size !== actorIds.length) {
      throw new Error("Combine expected combatants into one count per actor.");
    }
    for (const pointer of preset.strategy?.pointers ?? []) {
      if (!Array.isArray(pointer.actorIds) || !Array.isArray(pointer.notes)) {
        throw new Error("Each strategy pointer requires actorIds and notes arrays.");
      }
      pointer.actorIds.forEach(validateActorId);
    }
  } else if (!args.folder?.trim() || args.folder.length > 1000
    || !args.pages?.length || args.pages.some(page => !page.name?.trim() || page.name.length > 200 || typeof page.content !== "string")) {
    throw new Error("Supply a JournalEntry folder and 1-100 named text pages with HTML content.");
  }
}

/**
 * Presets refer to world Actor IDs, not encounter-specific combatant IDs.
 */
function validateActorId(id) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id ?? "")) {
    throw new Error("Use a discovered world Actor ID for briefing combatants and pointers.");
  }
}
