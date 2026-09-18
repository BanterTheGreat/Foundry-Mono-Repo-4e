import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/** Detects the configured actor missing a hostile target. */
export class YouMissTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.YOU_MISS,
      label: "You miss",
      description: "This actor misses an enemy with an attack.",
    });
  }

  /**
   * Returns the attacking actor when it misses a hostile target.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.ATTACK_RESULT || event.outcome !== "miss") {
      return [];
    }
    const attacker = services.getToken(event.attacker.sceneId, event.attacker.tokenId);
    const target = services.getToken(event.target.sceneId, event.target.tokenId);
    if (!attacker || !target || !services.areHostile(attacker, target)) {
      return [];
    }
    return [{ actor: attacker.actor, sourceName: target.name, detail: `${attacker.name} missed ${target.name}.` }];
  }
}
