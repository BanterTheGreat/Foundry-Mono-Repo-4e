import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/** Detects an enemy missing the configured actor while targeting AC or Reflex. */
export class AttackAgainstAcOrReflexMissesYouTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU,
      label: "An attack against AC or Reflex misses you",
      description: "An enemy misses this actor with an attack against AC or Reflex.",
    });
  }

  /**
   * Returns the missed target when the resolved defense is AC or Reflex.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.ATTACK_RESULT || event.outcome !== "miss" || !["ac", "ref"].includes(event.defenseType?.toLowerCase())) {
      return [];
    }
    const attacker = services.getToken(event.attacker.sceneId, event.attacker.tokenId);
    const target = services.getToken(event.target.sceneId, event.target.tokenId);
    if (!attacker || !target || !services.areHostile(attacker, target)) {
      return [];
    }
    return [{ actor: target.actor, sourceName: attacker.name, detail: `${attacker.name} missed ${target.name}'s ${event.defenseType.toUpperCase()}.` }];
  }
}
