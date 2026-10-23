import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const JOURNAL_PAGE_EDIT_SCHEMA = {
  uuid: "string", requestId: "string", summary: "string",
  add: [{ name: "string", content: "string" }],
  update: [{ id: "string", name: "string", content: "string" }],
  remove: ["string"]
};

/**
 * Limit journal mutations to named HTML text pages and exact embedded IDs.
 */
export function validateJournalPageEdit(args) {
  validateShape(args, JOURNAL_PAGE_EDIT_SCHEMA);
  validateChangeSummary(args.summary);
  if (!/^JournalEntry\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || !/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")) {
    throw new Error("Supply a world JournalEntry UUID and unique requestId.");
  }
  const { add = [], update = [], remove = [] } = args;
  if (!add.length && !update.length && !remove.length) {
    throw new Error("Supply pages to add, update or remove.");
  }
  for (const page of [...add, ...update]) {
    if (page.name !== undefined && (!page.name.trim() || page.name.length > 200)) {
      throw new Error("Page names must contain 1-200 characters.");
    }
  }
  if (add.some(page => page.name === undefined || page.content === undefined)
    || update.some(page => page.name === undefined && page.content === undefined)) {
    throw new Error("Add requires name and HTML content; update requires name or content.");
  }
  const ids = [...update.map(page => page.id), ...remove];
  if (ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id ?? "")) || new Set(ids).size !== ids.length) {
    throw new Error("Use unique page IDs, with no overlap between updates and removals.");
  }
}
