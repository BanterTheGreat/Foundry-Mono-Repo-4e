import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/** Detects the configured actor failing a saving throw. */
export class FailsSavingThrowTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.FAILS_SAVING_THROW,
      label: "Fails Saving Throw",
      description: "This actor fails a saving throw.",
    });
  }

  /**
   * Returns the saving actor when its completed saving throw failed.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.SAVING_THROW_RESULT || event.outcome !== "fail") {
      return [];
    }
    const combatant = services.findCombatant(event.actor);
    if (!combatant?.actor) {
      return [];
    }
    return [{ actor: combatant.actor, sourceName: combatant.name, detail: `${combatant.name} failed a saving throw.` }];
  }
}
