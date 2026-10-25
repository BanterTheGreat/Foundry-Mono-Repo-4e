import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

const keyed = (keys, shape) => Object.fromEntries(keys.split(" ").map(key => [key, shape]));
const trait = { value: ["string"], custom: "string" };

/**
 * Stored character fields verified against the DnD4e 0.9.3 data models.
 * Keep derived totals, embedded documents, flags and executable data excluded.
 */
export const PC_ACTOR_EDIT_SCHEMA = {
  uuid: "string", summary: "string", name: "string",
  system: {
    abilities: keyed("str con dex int wis cha", { value: "integer" }),
    skills: keyed("acr arc ath blu dip dun end hea his ins itm nat prc rel stl stw thi", {
      training: "integer", base: "integer", ability: "string", armourCheck: "boolean"
    }),
    details: {
      ...keyed("race class paragon epic age gender height weight alignment deity size origin type other", "string"),
      level: "integer", exp: "integer",
      weaponProf: trait, implementProf: trait, armourProf: trait
    },
    languages: { spoken: trait, script: trait },
    biography: "string"
  }
};

/**
 * Validate the same narrow partial update at both ends of the bridge.
 */
export function validatePcActorEdit(args) {
  validateShape(args, PC_ACTOR_EDIT_SCHEMA);
  validateChangeSummary(args.summary);
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")) {
    throw new Error("Select an existing world PC UUID.");
  }
  if (args.name !== undefined && (!args.name.trim() || args.name.length > 200)) {
    throw new Error("PC name must contain 1-200 characters.");
  }
  if (args.system?.details?.level !== undefined && (args.system.details.level < 1 || args.system.details.level > 30)) {
    throw new Error("PC level must be between 1 and 30.");
  }
  if (args.system?.details?.exp !== undefined && args.system.details.exp < 0) {
    throw new Error("Experience must be non-negative.");
  }
  for (const skill of Object.values(args.system?.skills ?? {})) {
    if (skill.training !== undefined && ![0, 5, 8].includes(skill.training)) {
      throw new Error("Skill training must be 0 (untrained), 5 (trained), or 8 (focus trained).");
    }
    if (skill.ability !== undefined && !["str", "con", "dex", "int", "wis", "cha"].includes(skill.ability)) {
      throw new Error("Skill ability must be a native ability key.");
    }
  }
}
