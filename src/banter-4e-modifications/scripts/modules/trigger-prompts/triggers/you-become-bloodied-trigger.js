import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/** Detects an actor crossing their own bloodied threshold. */
export class YouBecomeBloodiedTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.YOU_BECOME_BLOODIED,
      label: "You become bloodied",
      description: "This actor becomes bloodied.",
    });
  }

  /**
   * Returns the newly bloodied actor as the prompt recipient.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.BLOODIED) {
      return [];
    }

    const token = services.getToken(event.sceneId, event.tokenId);
    if (!token?.actor) {
      return [];
    }

    return [{ actor: token.actor, sourceName: token.name, detail: `${token.name} became bloodied.` }];
  }
}
