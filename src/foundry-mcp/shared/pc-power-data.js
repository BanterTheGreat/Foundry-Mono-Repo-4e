import { POWER_SYSTEM_SCHEMA, NPC_POWER_ADDITION_SCHEMA, validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const PC_POWER_EDIT_SCHEMA = {
  uuid: "string", summary: "string",
  addPowers: [NPC_POWER_ADDITION_SCHEMA],
  powers: [{ id: "string", name: "string", img: "string", system: POWER_SYSTEM_SCHEMA }]
};

/**
 * Validate PC power edits and additions without accepting executable data.
 */
export function validatePcPowerEdit(args) {
  validateShape(args, PC_POWER_EDIT_SCHEMA);
  validateChangeSummary(args.summary);
  const additions = args.addPowers ?? [];
  const keys = new Set();
  for (const power of additions) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(power.key ?? "") || keys.has(power.key)
      || !power.name?.trim() || power.name.length > 200 || !power.system) {
      throw new Error("Each new power requires a unique stable key, name and system data.");
    }
    keys.add(power.key);
  }
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || !(args.powers?.length || additions.length)
    || (args.powers?.length ?? 0) + additions.length > 100) {
    throw new Error("Supply a world PC UUID and 1-100 power patches or additions.");
  }
  const ids = new Set();
  for (const power of args.powers ?? []) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(power.id ?? "") || ids.has(power.id)
      || (power.name !== undefined && (!power.name.trim() || power.name.length > 200))) {
      throw new Error("Each power requires a unique existing ID and a valid name if supplied.");
    }
    ids.add(power.id);
  }
}
