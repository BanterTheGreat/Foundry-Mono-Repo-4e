import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/**
 * Detects an enemy missing the configured actor.
 *
 * Unlike the ally variant, this definition returns only the actual target and
 * has no range parameter.
 */
export class EnemyMissSelfTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.ENEMY_MISSES_YOU,
      label: "Enemy misses you",
      description: "An enemy misses this actor.",
    });
  }

  /**
   * Returns the missed hostile target as the sole prompt recipient.
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
    const missedTarget = services.getToken(event.target.sceneId, event.target.tokenId);
    if (!attacker || !missedTarget || !services.areHostile(attacker, missedTarget)) {
      return [];
    }

    return [{
      actor: missedTarget.actor,
      sourceName: attacker.name,
      detail: `${attacker.name} missed ${missedTarget.name}.`,
    }];
  }
}
