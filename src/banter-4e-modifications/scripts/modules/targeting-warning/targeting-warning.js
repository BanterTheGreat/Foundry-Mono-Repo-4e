import { MODULE_NAME } from "../../shared/globals.js";

const ENABLE_TARGETING_WARNING = "enable-targeting-warning";
const WARNING_MESSAGE = "Choose a target before rolling an attack.";
const WRAPPED_METHOD = Symbol("banter4eTargetingWarningWrapped");

/** Warn players when they start an attack roll without any selected targets. */
export class TargetingWarning {
  /** Register the world setting controlling untargeted attack reminders. */
  static registerSettings() {
    game.settings.register(MODULE_NAME, ENABLE_TARGETING_WARNING, {
      name: "Enable targeting warning",
      hint: "Warns players when they roll an attack without selecting a target. The attack still proceeds.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });
  }

  /** Install the warning around the DnD4e 0.9.3 Item4e attack-roll method. */
  static install() {
    const itemClass = CONFIG.Item.documentClass;
    const originalRollAttack = itemClass?.prototype?.rollAttack;
    if (!originalRollAttack || originalRollAttack[WRAPPED_METHOD]) {
      return;
    }

    async function rollAttackWithTargetingWarning(...args) {
      if (game.settings.get(MODULE_NAME, ENABLE_TARGETING_WARNING) && !game.user.isGM && game.user.targets.size === 0) {
        ui.notifications.warn(WARNING_MESSAGE);
      }

      return originalRollAttack.apply(this, args);
    }

    rollAttackWithTargetingWarning[WRAPPED_METHOD] = true;
    itemClass.prototype.rollAttack = rollAttackWithTargetingWarning;
  }
}
