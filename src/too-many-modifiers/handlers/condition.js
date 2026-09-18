import { TrackingHelper } from "../tracking-helper.js";

/**
 * Creates and removes status-condition Active Effects.
 */
export class ConditionNoteHandler {
  /**
   * Creates a condition-note handler.
   *
   * @param {object} data The submitted form data.
   * @param {object} effectData Shared Active Effect data.
   * @param {TokenDocument[]} tokenDocuments Tokens receiving the effects.
   */
  constructor(data, effectData, tokenDocuments) {
    this.data = data;
    this.effectData = effectData;
    this.tokenDocuments = tokenDocuments;
  }

  /**
   * Creates status effects for the selected conditions.
   *
   * @returns {Promise<void>}
   */
  async create() {
    if (!this.data.condition) return;

    const conditionEffect = CONFIG.statusEffects.find(statusEffect => statusEffect.name === this.data.condition);
    if (conditionEffect) {
      for (const tokenDoc of this.tokenDocuments) {
        await this._createConditionEffect(tokenDoc, conditionEffect);

        const conditionEffect2 = CONFIG.statusEffects.find(statusEffect => statusEffect.name === this.data.condition2);

        if (conditionEffect2) {
          await this._createConditionEffect(tokenDoc, conditionEffect2);
        }
      }
    } else {
      ui.notifications.warn(`Condition "${this.data.condition}" not found in CONFIG.statusEffects. Please ensure the condition exists and has a name property.`);
    }

  }

  /**
   * Creates an effect containing the configured status's mechanics and metadata.
   *
   * @param {TokenDocument} tokenDoc The token receiving the condition.
   * @param {object} statusEffect The configured DnD4e status effect.
   * @returns {Promise<void>}
   */
  async _createConditionEffect(tokenDoc, statusEffect) {
    const name = game.i18n.localize(statusEffect.name);
    const description = TrackingHelper.formatEffectDescription(
      name,
      this.effectData.flags["too-many-modifiers"].durationLabel,
    );
    const conditionLabFlags = statusEffect.flags?.["condition-lab-triggler"];

    await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
      ...this.effectData,
      name,
      img: statusEffect.img,
      description,
      changes: foundry.utils.deepClone(statusEffect.changes || []),
      statuses: new Set([statusEffect.id]),
      system: { ...this.effectData.system },
      flags: {
        ...(conditionLabFlags ? { "condition-lab-triggler": foundry.utils.deepClone(conditionLabFlags) } : {}),
        ...this.effectData.flags,
      },
    }]);
  }
}
