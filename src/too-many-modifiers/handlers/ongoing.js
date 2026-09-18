import { TrackingHelper } from "../tracking-helper.js";

/**
 * Creates native DnD4e ongoing-damage Active Effects.
 */
export class OngoingNoteHandler {
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
   * Creates one native ongoing-damage effect for each selected token.
   *
   * @returns {Promise<void>}
   */
  async create() {
    if (!this.data.ongoingType || !this.data.ongoingDamage) {
      return;
    }

    const description = TrackingHelper.formatEffectDescription(
      `Ongoing ${this.data.ongoingDamage} ${this.data.ongoingType}`,
      this.effectData.flags["too-many-modifiers"].durationLabel,
    );
    for (const tokenDoc of this.documents) {
      await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
        ...this.effectData,
        name: description,
        description,
        system: {
          ...this.effectData.system,
          dots: [{
            amount: String(this.data.ongoingDamage),
            types: new Set([this.data.ongoingType]),
          }],
        },
      }]);
    }
  }
}
