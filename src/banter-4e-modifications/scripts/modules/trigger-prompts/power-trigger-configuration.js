import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { TRIGGER_PROMPT_UI } from "./constants.js";

/**
 * Adapts legacy and ApplicationV2 item-sheet hooks to the per-power trigger
 * configuration dialog. It also removes stale actor assignments after a power
 * is deleted.
 */
export class PowerTriggerConfiguration {
  /**
   * Adds the configuration button to a legacy item-sheet header.
   *
   * @param {object} app
   * @param {object[]} buttons
   */
  static onGetItemSheetHeaderButtons(app, buttons) {
    const item = app.item ?? app.document;
    if (!PowerTriggerConfiguration.#canConfigure(item)) {
      return;
    }
    buttons.unshift({ class: TRIGGER_PROMPT_UI.ITEM_CONFIG_CLASS, icon: "fas fa-bolt", label: "Triggers", onclick: () => ActorTriggerConfiguration.showPowerDialog(item) });
  }

  /**
   * Adds the configuration control to a Foundry v13 ApplicationV2 item sheet.
   *
   * @param {object} app
   * @param {object[]} controls
   */
  static onGetHeaderControlsApplicationV2(app, controls) {
    const item = app.document;
    if (!PowerTriggerConfiguration.#canConfigure(item) || controls.some(control => control.action === TRIGGER_PROMPT_UI.ITEM_CONFIG_ACTION)) {
      return;
    }
    controls.unshift({ label: "Triggers", icon: "fas fa-bolt", class: TRIGGER_PROMPT_UI.ITEM_CONFIG_CLASS, action: TRIGGER_PROMPT_UI.ITEM_CONFIG_ACTION, onClick: () => ActorTriggerConfiguration.showPowerDialog(item) });
  }

  /**
   * Cleans up actor configuration after the local user deletes a power.
   *
   * The author check prevents every connected client from writing the same
   * actor flag in response to the replicated delete hook.
   *
   * @param {Item} item
   * @param {object} options
   * @param {string} userId
   * @returns {Promise<void>}
   */
  static async onDeleteItem(item, options, userId) {
    if (userId === game.user.id) {
      await ActorTriggerConfiguration.removeAssignmentsForItem(item);
    }
  }

  /**
   * Checks that a user can configure an actor-owned DnD4e power.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  static #canConfigure(item) {
    const actor = item?.parent;
    return item?.documentName === "Item" && item.type === "power" && actor?.documentName === "Actor" && (game.user.isGM || actor.isOwner);
  }
}
