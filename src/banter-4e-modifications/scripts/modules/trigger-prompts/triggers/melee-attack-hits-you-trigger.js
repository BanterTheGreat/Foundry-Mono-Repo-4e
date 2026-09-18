import { CombatTrigger } from "./combat-trigger.js";
import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "../constants.js";

/** Detects a hostile melee attack hitting its target. */
export class MeleeAttackHitsYouTrigger extends CombatTrigger {
  constructor() {
    super({
      id: TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK,
      label: "You are hit by a melee attack",
      description: "An enemy hits this actor with a Weapon or Melee X attack.",
    });
  }

  /**
   * Returns the target actor when an enemy's Weapon or Melee X attack hits.
   *
   * @param {object} event
   * @param {object} services
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    if (event.type !== TRIGGER_EVENT_TYPE.ATTACK_RESULT || event.outcome !== "hit" || !MeleeAttackHitsYouTrigger.#isMeleeRange(event.attackRange)) {
      return [];
    }

    const attacker = services.getToken(event.attacker.sceneId, event.attacker.tokenId);
    const target = services.getToken(event.target.sceneId, event.target.tokenId);
    if (!attacker || !target || !services.areHostile(attacker, target)) {
      return [];
    }

    return [{ actor: target.actor, sourceName: attacker.name, detail: `${attacker.name} hit ${target.name} with a melee attack.` }];
  }

  /** @param {unknown} attackRange @returns {boolean} Whether the legacy range is melee. */
  static #isMeleeRange(attackRange) {
    const range = typeof attackRange === "string" ? attackRange.trim().toLowerCase() : "";
    return range === "weapon" || range === "melee" || /^melee\s+\d+$/.test(range);
  }
}
