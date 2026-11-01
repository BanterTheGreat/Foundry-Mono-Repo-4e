import { MODULE_NAME } from "../../shared/globals.js";
import { TRIGGER_CONFIGURATION_FLAG } from "./constants.js";
import { findTriggerById } from "./trigger-definitions.js";

/**
 * Where an assignment came from: ticked by hand, or ticked from a suggestion
 * the user reviewed and saved.
 */
export const ASSIGNMENT_SOURCE = Object.freeze({
  MANUAL: "manual",
  TEXT: "text",
});

/**
 * Reads and writes the trigger assignments stored on a power.
 *
 * Assignments are a flag on the Item, so they travel with the power when it is
 * duplicated, dragged to another actor, or imported from a compendium. The flag
 * holds `{version, assignments: [{triggerId, parameters, source}]}`. The list
 * is an array because Foundry replaces arrays but merges objects, and a saved
 * list must be able to drop an assignment.
 */
export class ItemTriggerAssignments {
  /**
   * Reads a power's stored assignments.
   *
   * @param {Item} item
   * @returns {{configured: boolean, assignments: Array<{triggerId: string, parameters: {rangeSquares?: number}, source: string}>}}
   *   `configured` is true once the user has saved this power's dialog, even
   *   with no assignments; unknown trigger IDs are ignored.
   */
  static read(item) {
    const stored = item.flags?.[MODULE_NAME]?.[TRIGGER_CONFIGURATION_FLAG];
    if (!Array.isArray(stored?.assignments)) {
      return { configured: false, assignments: [] };
    }
    const assignments = stored.assignments
      .filter(assignment => findTriggerById(assignment?.triggerId))
      .map(assignment => ({
        triggerId: assignment.triggerId,
        parameters: assignment.parameters ?? {},
        source: assignment.source ?? ASSIGNMENT_SOURCE.MANUAL,
      }));
    return { configured: true, assignments };
  }

  /**
   * Replaces a power's stored assignments.
   *
   * @param {Item} item
   * @param {Array<{triggerId: string, parameters: object, source: string}>} assignments
   * @returns {Promise<void>}
   */
  static async write(item, assignments) {
    await item.setFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG, { version: 1, assignments });
  }

  /**
   * Returns the DnD4e trigger text recorded on a power, if available.
   *
   * @param {Item} item
   * @returns {string}
   *   Human-readable trigger text, or an empty string when it is absent.
   */
  static getTriggerText(item) {
    const trigger = item.system?.trigger;
    return typeof trigger === "string" ? trigger : trigger?.value ?? trigger?.text ?? "";
  }
}
