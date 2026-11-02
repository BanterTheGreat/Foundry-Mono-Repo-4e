import { PowerTriggerDialog } from "./power-trigger-dialog.js";
import { TRIGGER_PROMPT_UI } from "./constants.js";

/**
 * Adapts legacy and ApplicationV2 item-sheet hooks to the per-power trigger
 * dialog. Assignments are stored on the item itself, so there is nothing to
 * clean up when a power is deleted.
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
    buttons.unshift({ class: TRIGGER_PROMPT_UI.ITEM_CONFIG_CLASS, icon: "fas fa-bolt", label: "Triggers", onclick: () => PowerTriggerDialog.show(item) });
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
    controls.unshift({ label: "Triggers", icon: "fas fa-bolt", class: TRIGGER_PROMPT_UI.ITEM_CONFIG_CLASS, action: TRIGGER_PROMPT_UI.ITEM_CONFIG_ACTION, onClick: () => PowerTriggerDialog.show(item) });
  }

  /**
   * Checks that the user can configure a DnD4e power or feat, whether it belongs to an
   * actor or stands alone in the world.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  static #canConfigure(item) {
    return item?.documentName === "Item" && ["power", "feat", "feature"].includes(item.type) && (game.user.isGM || item.isOwner);
  }
}
