import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/**
 * Detects an enemy hitting the configured actor.
 *
 * Friendly attacks and non-hit attack-result events never produce a context.
 */
export class EnemyHitSelfTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.ENEMY_HITS_YOU,
      label: "Enemy hits you",
      defaultRangeSquares: 10,
      description: "An enemy within the configured range hits this actor.",
    });
  }

  /**
   * Returns the hit hostile target as the sole prompt recipient.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string, distanceSquares: number}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.ATTACK_RESULT || event.outcome !== "hit") {
      return [];
    }

    const attacker = services.getToken(event.attacker.sceneId, event.attacker.tokenId);
    const target = services.getToken(event.target.sceneId, event.target.tokenId);
    if (!attacker || !target || !services.areHostile(attacker, target)) {
      return [];
    }

    return [{
      actor: target.actor,
      sourceName: attacker.name,
      detail: `${attacker.name} hit ${target.name}.`,
      distanceSquares: services.distanceSquares(attacker, target),
    }];
  }
}
