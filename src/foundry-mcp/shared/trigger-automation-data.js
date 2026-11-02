import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const TRIGGER_MODULE = "banter-4e-modifications";
export const TRIGGER_FLAG = "trigger-prompts";
export const TRIGGER_PARAMETERS = {
  rangeSquares: "integer", nonMinion: "boolean", meleeOnly: "boolean", adjacentOnly: "boolean",
  attackTypes: ["string"], defenseTypes: ["string"], damageTypes: ["string"], companionActorUuid: "string"
};
export const TRIGGER_EDIT_SCHEMA = {
  summary: "string", uuid: "string", opportunityAttack: { enabled: "boolean", oncePerTurn: "boolean" },
  reminders: [{ triggerId: "string", enabled: "boolean" }],
  items: [{ uuid: "string", assignments: [{ triggerId: "string", parameters: TRIGGER_PARAMETERS, source: "string" }],
    limit: "string", automatic: "boolean" }]
};
const actorUuid = /^Actor\.[A-Za-z0-9_-]{1,128}$/;
const itemUuid = /^(?:Actor\.[A-Za-z0-9_-]{1,128}\.)?Item\.[A-Za-z0-9_-]{1,128}$/;

/** Validate a bounded declarative edit at both bridge boundaries. */
export function validateTriggerAutomation(args, editing = false) {
  validateShape(args, editing ? TRIGGER_EDIT_SCHEMA : { uuid: "string" });
  if (!editing) {
    if (!actorUuid.test(args.uuid ?? "") && !itemUuid.test(args.uuid ?? "")) {
      throw new Error("Supply a world Actor or Item UUID.");
    }
    return;
  }
  validateChangeSummary(args.summary);
  if (args.uuid !== undefined && !actorUuid.test(args.uuid)) {
    throw new Error("Actor options require a world Actor UUID.");
  }
  if ((args.opportunityAttack !== undefined || args.reminders !== undefined) && !args.uuid) {
    throw new Error("Supply uuid for actor options.");
  }
  if (!args.items?.length && !Object.keys(args.opportunityAttack ?? {}).length && !args.reminders?.length) {
    throw new Error("Supply item configuration or actor options.");
  }
  const seen = new Set();
  for (const item of args.items ?? []) {
    if (!itemUuid.test(item.uuid ?? "") || seen.has(item.uuid)
      || (item.assignments === undefined && item.limit === undefined && item.automatic === undefined)) {
      throw new Error("Supply distinct world Items and nonempty configurations.");
    }
    seen.add(item.uuid);
    if (item.limit !== undefined && !["none", "turn", "firstEncounter", "day"].includes(item.limit)) {
      throw new Error("Invalid shared item limit.");
    }
    const triggers = new Set();
    for (const assignment of item.assignments ?? []) {
      if (!assignment.triggerId || triggers.has(assignment.triggerId)
        || (assignment.source !== undefined && !["manual", "text"].includes(assignment.source))) {
        throw new Error("Supply distinct trigger IDs and manual/text sources.");
      }
      triggers.add(assignment.triggerId);
      if (assignment.parameters?.rangeSquares < 0) {
        throw new Error("Range must be a non-negative integer.");
      }
      if (assignment.parameters?.companionActorUuid !== undefined && !actorUuid.test(assignment.parameters.companionActorUuid)) {
        throw new Error("Companions require a world Actor UUID.");
      }
    }
  }
  const reminders = new Set();
  for (const reminder of args.reminders ?? []) {
    if (!reminder.triggerId || typeof reminder.enabled !== "boolean" || reminders.has(reminder.triggerId)) {
      throw new Error("Supply distinct reminder IDs and enabled booleans.");
    }
    reminders.add(reminder.triggerId);
  }
}
