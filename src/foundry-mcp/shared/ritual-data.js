import { validateShape } from "./npc-data.js";

export const DEFAULT_RITUAL_IMAGE = "modules/fox-commons/images/Icons/Items/Documents/Notebook-08_Poneti.webp";

/**
 * Validate authored rituals independently in the companion and GM browser.
 * Only descriptive fields are accepted; no executable or effect source data.
 */
export function validateRitualRequest(args) {
  const { level, ...fields } = args ?? {};
  validateShape(fields, {
    requestId: "string", name: "string", text: "string",
    description: "string", actorUuid: "string", folder: "string"
  });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")
    || !args.name?.trim() || args.name.length > 200
    || !(Number.isInteger(level) && level >= 1 && level <= 30)
    || typeof args.text !== "string" || typeof args.description !== "string") {
    throw new Error("Supply a unique requestId, ritual name, level from 1 to 30, text and description.");
  }
  if (args.actorUuid !== undefined && !/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.actorUuid)) {
    throw new Error("Choose a world PC Actor UUID.");
  }
  if (args.folder !== undefined && (!args.folder.trim() || args.folder.length > 1000)) {
    throw new Error("Choose a non-empty Item folder name, path or ID.");
  }
  if (args.actorUuid !== undefined && args.folder !== undefined) {
    throw new Error("Choose a PC or an Item folder, not both.");
  }
}
