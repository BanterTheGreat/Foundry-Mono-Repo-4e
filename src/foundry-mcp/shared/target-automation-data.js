import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const AUTOMATION_MODULE = "dnd4e-health-display";
export const AUTOMATION_FLAG = "targetAutomation";
export const AUTOMATION_CONFIG_SCHEMA = {
  enabled: "boolean", targetCount: "integer", targetCountMode: "string",
  targetMode: "string", targetDisposition: "string", includeCaster: "boolean",
  targetCondition: "string", targetAdjacent: "string", summonActor: "string",
  placementMode: "string", originActors: ["string"], originMode: "string",
  allowCaster: "boolean", placeRegion: "boolean", wallSolid: "boolean", wallHeight: "integer"
};
export const AUTOMATION_EDIT_SCHEMA = {
  uuid: "string", summary: "string", originActors: ["string"],
  powers: [{ uuid: "string", config: AUTOMATION_CONFIG_SCHEMA }]
};
const actorUuid = /^Actor\.[A-Za-z0-9_-]{1,128}$/;
const powerUuid = /^(?:Actor\.[A-Za-z0-9_-]{1,128}\.)?Item\.[A-Za-z0-9_-]{1,128}$/;
const choices = {
  targetCountMode: ["exact", "upTo"], targetMode: ["area", "exact"],
  targetDisposition: ["all", "allies", "enemies"], targetAdjacent: ["", "allies", "enemies"],
  placementMode: ["targets", "summon"], originMode: ["character", "custom"]
};

/**
 * Accept only declarative automation fields and exact world destinations.
 */
export function validateTargetAutomation(args, editing = false) {
  validateShape(args, editing ? AUTOMATION_EDIT_SCHEMA : { uuid: "string" });
  if (editing) {
    validateChangeSummary(args.summary);
    if (args.uuid !== undefined && !actorUuid.test(args.uuid)) {
      throw new Error("Shared origins require a world Actor UUID.");
    }
    if (args.originActors !== undefined && !args.uuid) {
      throw new Error("Supply uuid for shared actor origins.");
    }
    if (args.originActors === undefined && !args.powers?.length) {
      throw new Error("Supply origins or at least one power configuration.");
    }
    const seen = new Set();
    for (const power of args.powers ?? []) {
      if (!powerUuid.test(power.uuid ?? "") || seen.has(power.uuid) || !power.config || !Object.keys(power.config).length) {
        throw new Error("Supply unique world power UUIDs and nonempty configurations.");
      }
      seen.add(power.uuid);
      for (const [key, values] of Object.entries(choices)) {
        if (power.config[key] !== undefined && !values.includes(power.config[key])) {
          throw new Error(`Invalid ${key}.`);
        }
      }
      for (const key of ["targetCount", "wallHeight"]) {
        if (power.config[key] !== undefined && power.config[key] < 1) {
          throw new Error(`${key} must be a positive integer.`);
        }
      }
      if (power.config.summonActor && !actorUuid.test(power.config.summonActor)) {
        throw new Error("Summons require a world Actor UUID.");
      }
      validateOrigins(power.config.originActors);
    }
    validateOrigins(args.originActors);
  } else if (!actorUuid.test(args.uuid ?? "") && !powerUuid.test(args.uuid ?? "")) {
    throw new Error("Supply a world Actor or power Item UUID.");
  }
}

/**
 * Require distinct, resolvable world actors rather than arbitrary document paths.
 */
function validateOrigins(origins) {
  if (origins && (new Set(origins).size !== origins.length || origins.some(uuid => !actorUuid.test(uuid)))) {
    throw new Error("Origins must be distinct world Actor UUIDs.");
  }
}
