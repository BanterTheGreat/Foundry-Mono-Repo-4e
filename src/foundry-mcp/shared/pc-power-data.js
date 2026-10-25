import { POWER_SYSTEM_SCHEMA, validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const PC_POWER_EDIT_SCHEMA = {
  uuid: "string", summary: "string",
  powers: [{ id: "string", name: "string", img: "string", system: POWER_SYSTEM_SCHEMA }]
};

/**
 * Validate partial edits to existing PC powers without accepting executable data.
 */
export function validatePcPowerEdit(args) {
  validateShape(args, PC_POWER_EDIT_SCHEMA);
  validateChangeSummary(args.summary);
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || !Array.isArray(args.powers) || !args.powers.length) {
    throw new Error("Supply a world PC UUID and 1-100 existing power patches.");
  }
  const ids = new Set();
  for (const power of args.powers) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(power.id ?? "") || ids.has(power.id)
      || (power.name !== undefined && (!power.name.trim() || power.name.length > 200))) {
      throw new Error("Each power requires a unique existing ID and a valid name if supplied.");
    }
    ids.add(power.id);
  }
}
