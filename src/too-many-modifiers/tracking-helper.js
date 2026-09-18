import { MODULE_ID } from "./constants.js";

/**
 * Provides the Active Effect lifecycle used by the tracking HUD.
 */
export class TrackingHelper {
  /**
   * Combines an effect's displayed text with its selected duration.
   *
   * @param {string} text The effect text.
   * @param {string} duration The human-readable duration.
   * @returns {string} The description displayed in the token overlay.
   */
  static formatEffectDescription(text, duration) {
    return duration ? `${text} \u25c6 ${duration}` : text;
  }

  /**
   * Deletes module-created effects corresponding to notes selected in the HUD.
   *
   * @param {TokenDocument} token The affected token document.
   * @param {object[]} notes The displayed notes to remove.
   * @returns {Promise<void>}
   */
  static async deleteNotesAndEffects(token, notes) {
    if (!token?.actor || !Array.isArray(notes)) {
      return;
    }

    const effects = TrackingHelper.getTrackedEffects(token).filter(effect => {
      return notes.some(note => {
        return note.text === TrackingHelper.stripHtml(effect.description) && note.duration === effect.duration.label;
      });
    });
    if (effects.length > 0) {
      await token.actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    }
  }

  /**
   * Formats every temporary Active Effect description for the token overlay.
   *
   * @param {TokenDocument} token The token whose effect descriptions are displayed.
   * @returns {string|undefined} Newline-separated effect descriptions.
   */
  static formatNotesForDisplay(token) {
    if (!token?.actor) {
      return undefined;
    }

    return token.actor.effects
      .filter(effect => effect.isTemporary && effect.description)
      .map(effect => TrackingHelper.formatEffectForDisplay(effect))
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Formats an Active Effect description and its current duration for the token overlay.
   *
   * @param {ActiveEffect} effect The Active Effect to format.
   * @returns {string} The plain-text description with its duration, when available.
   */
  static formatEffectForDisplay(effect) {
    const durationLabel = effect.getFlag(MODULE_ID, "durationLabel");
    const separator = " \u25c6 ";
    let description = TrackingHelper.stripHtml(effect.description);

    if (durationLabel && description.endsWith(`${separator}${durationLabel}`)) {
      description = description.slice(0, -(`${separator}${durationLabel}`).length);
    }

    return TrackingHelper.formatEffectDescription(description, TrackingHelper.getDurationLabel(effect));
  }

  /**
   * Gets the DnD4e label for an Active Effect's configured duration.
   *
   * @param {ActiveEffect} effect The Active Effect to inspect.
   * @returns {string|undefined} The human-readable duration label, when available.
   */
  static getDurationLabel(effect) {
    const durationType = effect.system?.durationType;
    const durationLabel = effect.duration?.label || CONFIG.DND4E?.durationType?.[durationType]?.label;

    if (durationType !== "endOfUserTurn" || !effect.origin || !durationLabel) {
      return durationLabel;
    }

    const user = fromUuidSync(effect.origin);
    return user?.name ? `EonT ${user.name}` : durationLabel;
  }

  /**
   * Removes HTML markup from an Active Effect description before it is rendered as a note.
   *
   * @param {string} description The Active Effect description.
   * @returns {string} The plain-text description.
   */
  static stripHtml(description) {
    const container = document.createElement("div");
    container.innerHTML = description || "";
    return container.textContent?.trim() || "";
  }

  /**
   * Gets effects created by this module for the HUD's removal table.
   *
   * @param {TokenDocument} token The token document to inspect.
   * @returns {ActiveEffect[]} The module-created effects.
   */
  static getTrackedEffects(token) {
    if (!token?.actor) {
      return [];
    }

    return token.actor.effects.filter(effect => effect.getFlag(MODULE_ID, "tracked"));
  }
}
