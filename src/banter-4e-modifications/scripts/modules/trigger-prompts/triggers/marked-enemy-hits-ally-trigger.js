import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/**
 * Detects an enemy marked by an actor hitting one of that actor's allies.
 *
 * The prompt is an actor-level reminder rather than a power choice, because
 * the response depends on the marker's own game features.
 */
export class MarkedEnemyHitsAllyTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.MARKED_ENEMY_HITS_ALLY,
      label: "A creature you have marked hit an ally",
      description: "Show a reminder when a creature marked by this actor hits one of its allies.",
      actorLevel: true,
    });
  }

  /**
   * Returns the Mark owner when its marked enemy hits another allied token.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.ATTACK_RESULT || event.outcome !== "hit") {
      return [];
    }

    const attacker = services.getToken(event.attacker.sceneId, event.attacker.tokenId);
    const target = services.getToken(event.target.sceneId, event.target.tokenId);
    const owner = attacker && services.markOwner(attacker);
    if (!attacker || !target || !owner || target.id === owner.id || !services.areHostile(attacker, target) || !services.areAllies(owner, target)) {
      return [];
    }

    return [{
      actor: owner.actor,
      sourceName: attacker.name,
      detail: `${attacker.name}, marked by ${owner.name}, hit ${target.name}.`,
    }];
  }
}
