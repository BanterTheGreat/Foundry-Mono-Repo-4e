import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const WORLD_POWER_NAME_SCHEMA = { powers: [{ uuid: "string", name: "string" }], summary: "string" };

/** Validate a batch of names without allowing other document changes. */
export function validateWorldPowerNames(args) {
  validateShape(args, WORLD_POWER_NAME_SCHEMA);
  validateChangeSummary(args.summary);
  const powers = args.powers;
  if (!powers?.length || powers.length > 100 || new Set(powers.map(power => power.uuid)).size !== powers.length
    || powers.some(power => !/^Item\.[A-Za-z0-9_-]{1,128}$/.test(power.uuid ?? "")
      || typeof power.name !== "string" || !power.name.trim() || power.name.trim().length > 200)) {
    throw new Error("Supply 1-100 distinct world Item UUIDs and nonblank power names of at most 200 characters.");
  }
}
