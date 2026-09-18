import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/**
 * Detects hostile movement that starts or passes adjacent to a configured actor.
 *
 * Candidate actors are found from the combat roster; assignment resolution
 * later chooses each actor's DnD4e-marked opportunity powers.
 */
export class OpportunityAttackTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.OPPORTUNITY_ATTACK,
      label: "Possible opportunity attack",
      description: "A hostile combatant's movement starts or passes adjacent to this actor; ending adjacent alone does not qualify.",
    });
  }

  /**
   * Returns each hostile combatant adjacent during the movement path.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.MOVEMENT) {
      return [];
    }

    const mover = services.getToken(event.sceneId, event.tokenId);
    if (!mover) {
      return [];
    }

    return services.combatants
      .filter(combatant => combatant.id !== event.combatant.id && combatant.sceneId === event.sceneId)
      .map(combatant => services.getToken(combatant.sceneId, combatant.tokenId))
      .filter(candidate => candidate && services.areHostile(mover, candidate) && services.movesAdjacent(mover, event.destination, candidate))
      .map(candidate => ({
        actor: candidate.actor,
        sourceName: mover.name,
        detail: `${mover.name} moved adjacent to ${candidate.name}.`,
      }));
  }
}
