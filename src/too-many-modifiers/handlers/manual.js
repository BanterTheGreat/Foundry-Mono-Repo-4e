import { TrackingHelper } from "../tracking-helper.js";

/**
 * Creates free-form reminder Active Effects.
 */
export class ManualNoteHandler {
  /**
   * @param {object} data The submitted form data.
   * @param {object} effectData Shared Active Effect data.
   * @param {TokenDocument[]} documents Tokens receiving the effect.
   */
  constructor(data, effectData, documents) {
    this.data = data;
    this.effectData = effectData;
    this.documents = documents;
  }

  /**
   * Creates one temporary reminder effect for each selected token.
   *
   * @returns {Promise<void>}
   */
  async create() {
    if (!this.data.manualCondition) {
      return;
    }

    for (const tokenDoc of this.documents) {
      const description = TrackingHelper.formatEffectDescription(
        this.data.manualCondition,
        this.effectData.flags["too-many-modifiers"].durationLabel,
      );
      await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
        ...this.effectData,
        name: description,
        description,
      }]);
    }
  }
}
