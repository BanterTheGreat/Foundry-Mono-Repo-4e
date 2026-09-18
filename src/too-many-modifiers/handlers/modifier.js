import { TrackingHelper } from "../tracking-helper.js";

/**
 * Creates and removes Active Effects for numeric modifiers.
 */
export class ModifierNoteHandler {
  /**
   * Creates a modifier-note handler.
   *
   * @param {object} data The submitted form data.
   * @param {object} effectData Shared Active Effect data.
   * @param {TokenDocument[]} documents Tokens receiving the effects.
   * @param {Combat} combat The active combat, if any.
   */
  constructor(data, effectData, documents, combat) {
    this.data = data;
    this.effectData = effectData;
    this.documents = documents;
    this.combat = combat;
  }

  /**
   * Creates modifier Active Effects.
   *
   * @returns {Promise<void>}
   */
  async create() {
    if (!this.data.modifierType || !this.data.numberValue) return;

    const modifierValue = this._getModifierValue();
    const changeKeys = this._getChangeKeys();

    if (!changeKeys || !modifierValue) {
      ui.notifications.warn("Unsupported modifier type or zero modifier value. Modifier note will not be created.");
      return;
    };

    const changes = changeKeys.map(key => {
      // Effect Modes
      // 0: Custom
      // 1: Multiply
      // 2: Add
      // 3: Downgrade
      // 4: Upgrade
      // 5: Override
      return {
        key: key,
        mode: this.data.modifierBonusType === 'untyped' ? 2 : 4, // They should not stack if we got an type.
        value: modifierValue,
      }
    });

    // Create the effects.
    for (const tokenDoc of this.documents) {
      const description = TrackingHelper.formatEffectDescription(
        `${modifierValue > 0 ? '+' : ''}${modifierValue} ${this.data.modifierType} (${this.data.modifierBonusType})`,
        this.effectData.flags["too-many-modifiers"].durationLabel,
      );
      await tokenDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
        ...this.effectData,
        name: description,
        description,
        changes: changes,
        system: { ...this.effectData.system },
      }]);
    }
  }

  /**
   * Parses the modifier spinner value.
   *
   * @returns {number} The numeric modifier, or zero when invalid.
   */
  _getModifierValue() {
    // Simply return the number value from the spinner
    return Number.parseInt(this.data.numberValue) || 0;
  }

  /**
   * Maps the selected modifier type to DnD4e effect paths.
   *
   * @returns {string[]|undefined} The change keys for the selected type.
   */
  _getChangeKeys() {
    const modifierPaths = {
      "ac": ["system.defences.ac"],
      "speed": ["system.movement.base"],
      "damage": ["system.modifiers.damage"],
      "savingThrows": ["system.details.saves"],
      "attacks": ["system.modifiers.attack"],
      'defenses': ["system.defences.ac", "system.defences.fort", "system.defences.ref", "system.defences.wil"],
    };

    const basePath = modifierPaths[this.data.modifierType];

    if (!basePath) return;

    return basePath.map(path => path + `.${this.data.modifierBonusType}`);
  }
}
