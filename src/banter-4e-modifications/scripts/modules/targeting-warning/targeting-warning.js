const WARNING_MESSAGE = "Choose a target before rolling an attack.";
const WRAPPED_METHOD = Symbol("banter4eTargetingWarningWrapped");

/** Warn players when they start an attack roll without any selected targets. */
export class TargetingWarning {
  /** Install the warning around the DnD4e 0.9.3 Item4e attack-roll method. */
  static install() {
    const itemClass = CONFIG.Item.documentClass;
    const originalRollAttack = itemClass?.prototype?.rollAttack;
    if (!originalRollAttack || originalRollAttack[WRAPPED_METHOD]) {
      return;
    }

    async function rollAttackWithTargetingWarning(...args) {
      if (!game.user.isGM && game.user.targets.size === 0) {
        ui.notifications.warn(WARNING_MESSAGE);
      }

      return originalRollAttack.apply(this, args);
    }

    rollAttackWithTargetingWarning[WRAPPED_METHOD] = true;
    itemClass.prototype.rollAttack = rollAttackWithTargetingWarning;
  }
}
