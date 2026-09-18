import { TrackingHelper } from "../tracking-helper.js";

/**
 * Creates and removes Active Effects for resistances and vulnerabilities.
 */
export class ResistanceNoteHandler {
  /**
   * Creates a resistance-note handler.
   *
   * @param {object} data The submitted form data.
   * @param {object} effectData Shared Active Effect data.
   * @param {TokenDocument[]} documents Tokens receiving the effects.
   */
  constructor(data, effectData, documents) {
    this.data = data;
    this.effectData = effectData;
    this.documents = documents;
  }

  /**
   * Creates resistance effects.
   *
   * @returns {Promise<void>}
   */
  async create() {
    if (!this.data.resistanceType || !this.data.resistanceValue) return;

    // Create the effects.
    for (const tokenDoc of this.documents) {
      // HACK: Auto-calculate seems to only work for resistances. Vulnerabilities go through the bonus dialog.
      const isResistance = this.data.resistanceValue > 0;
      const description = TrackingHelper.formatEffectDescription(
        `${this.data.resistanceValue > 0 ? '+' : ''}${this.data.resistanceValue} ${this.data.resistanceType} Resistance`,
        this.effectData.flags["too-many-modifiers"].durationLabel,
      );
      await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
        ...this.effectData,
        name: description,
        description,
        changes: [
          {
            key: `system.resistances.${this.data.resistanceType}.${isResistance ? 'res' : 'vuln'}`,
            mode: isResistance ? 4 : 3, // 4: Highest take priority. 3: Lowest take priority
            value: this.data.resistanceValue,
          }
        ],
        system: { ...this.effectData.system },
      }]);
    }
  }
}
