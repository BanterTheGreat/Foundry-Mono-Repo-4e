import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/**
 * Detects a creature crossing its bloodied threshold while owned by a Mark.
 *
 * Mark ownership is resolved through the shared ownership store and only an
 * owner currently represented in combat is eligible.
 */
export class MarkedCreatureBloodiedTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.MARKED_CREATURE_BLOODIED,
      label: "Creature marked by you becomes bloodied",
      description: "A creature carrying a Mark owned by this actor becomes bloodied.",
    });
  }

  /**
   * Returns the marked token's owner when a bloodied event is eligible.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.BLOODIED) {
      return [];
    }
    const marked = services.getToken(event.sceneId, event.tokenId);
    const owner = marked && services.markOwner(marked);
    if (!marked || !owner) {
      return [];
    }
    return [{ actor: owner.actor, sourceName: marked.name, detail: `${marked.name}, marked by ${owner.name}, became bloodied.` }];
  }
}
