export const MARK_IDS = new Set(["mark", "mark_1", "mark_2", "mark_3", "mark_4", "mark_5", "mark_6", "mark_7"]);
export const OWNERSHIP_FLAG = "markOwnership";
export const MARKER_CHANGE_KEY = "system.marker";

/**
 * Returns whether an ActiveEffect carries any of DnD4e's seven Mark statuses.
 *
 * @param {ActiveEffect} effect
 *   Effect whose status identifiers should be inspected.
 * @returns {boolean}
 *   Whether the effect represents a Mark condition.
 */
export function isMark(effect) {
  return Array.from(effect.statuses ?? []).some(status => MARK_IDS.has(status));
}
