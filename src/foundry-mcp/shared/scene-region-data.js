import { validateChangeSummary } from "./confirmation-data.js";
import {
  validateElevationBehavior, validateRegionElevation, validateRegionIdentity, validateRegionShapes
} from "./elevation-region-data.js";

export const SCENE_REGION_UPDATE_FIELDS = ["id", "name", "color", "shapes", "elevation", "behavior"];
export const SCENE_REGION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Validate a bounded scene Region read request.
 */
export function validateSceneRegionRead(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)
    || !/^Scene\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")) {
    throw new Error("A world Scene UUID is required.");
  }
  return args;
}

/**
 * Validate scoped Region edits in the companion and in the GM browser. Updates
 * replace only the supplied fields; shapes replace the complete shape list and
 * behavior patches the single Elevation behavior.
 */
export function validateSceneRegionEdit(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)
    || Object.keys(args).some(key => !["uuid", "summary", "update", "remove"].includes(key))) {
    throw new Error("Expected a scene Region edit with uuid, update and remove only.");
  }
  if (!/^Scene\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")) {
    throw new Error("A world Scene UUID is required.");
  }
  validateChangeSummary(args.summary);
  const { update = [], remove = [] } = args;
  if (!Array.isArray(update) || !Array.isArray(remove) || update.length > 100 || remove.length > 100) {
    throw new Error("update and remove must be arrays of at most 100 entries.");
  }
  if (!update.length && !remove.length) {
    throw new Error("Supply Regions to update or remove.");
  }
  for (const region of update) {
    if (!region || typeof region !== "object" || Array.isArray(region)
      || Object.keys(region).some(key => !SCENE_REGION_UPDATE_FIELDS.includes(key))) {
      throw new Error("Region updates support id, name, color, shapes, elevation and behavior only.");
    }
    if (Object.keys(region).length < 2) {
      throw new Error("Each Region update must change at least one field.");
    }
    validateRegionIdentity(region, { nameRequired: false });
    if (region.shapes !== undefined) {
      validateRegionShapes(region.shapes);
    }
    if (region.elevation !== undefined) {
      validateRegionElevation(region.elevation);
    }
    if (region.behavior !== undefined) {
      validateElevationBehavior(region.behavior, { partial: true });
    }
  }
  const ids = [...update.map(region => region.id), ...remove];
  if (ids.some(id => typeof id !== "string" || !SCENE_REGION_ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Use unique Region IDs, with no overlap between updates and removals.");
  }
  return args;
}
