import { OpportunityAttackTrigger } from "./triggers/opportunity-attack-trigger.js";
import { EnemyMissTrigger } from "./triggers/enemy-miss-trigger.js";
import { EnemyMissSelfTrigger } from "./triggers/enemy-miss-self-trigger.js";
import { EnemyHitSelfTrigger } from "./triggers/enemy-hit-self-trigger.js";
import { AttackAgainstAcOrReflexMissesYouTrigger } from "./triggers/attack-against-ac-or-reflex-misses-you-trigger.js";
import { YouMissTrigger } from "./triggers/you-miss-trigger.js";
import { MarkedEnemyHitsAllyTrigger } from "./triggers/marked-enemy-hits-ally-trigger.js";
import { MarkedCreatureBloodiedTrigger } from "./triggers/marked-creature-bloodied-trigger.js";
import { YouBecomeBloodiedTrigger } from "./triggers/you-become-bloodied-trigger.js";
import { MeleeAttackHitsYouTrigger } from "./triggers/melee-attack-hits-you-trigger.js";
import { MarkedCreatureMovesAdjacentTrigger } from "./triggers/marked-creature-moves-adjacent-trigger.js";
import { FailsSavingThrowTrigger } from "./triggers/fails-saving-throw-trigger.js";

/**
 * All trigger definitions supported by the submodule.
 *
 * Registry order determines the order in which attack-result prompts are
 * evaluated and delivered.
 *
 * @type {Array<import("./triggers/combat-trigger.js").CombatTrigger>}
 */
export const TRIGGERS = [
  new OpportunityAttackTrigger(),
  new EnemyMissSelfTrigger(),
  new EnemyMissTrigger(),
  new EnemyHitSelfTrigger(),
  new AttackAgainstAcOrReflexMissesYouTrigger(),
  new YouMissTrigger(),
  new MarkedEnemyHitsAllyTrigger(),
  new MarkedCreatureBloodiedTrigger(),
  new YouBecomeBloodiedTrigger(),
  new MeleeAttackHitsYouTrigger(),
  new MarkedCreatureMovesAdjacentTrigger(),
  new FailsSavingThrowTrigger(),
];

/**
 * Looks up a trigger definition by its persisted identifier.
 *
 * @param {string} id
 *   Stable trigger identifier from {@link TRIGGER_ID}.
 * @returns {import("./triggers/combat-trigger.js").CombatTrigger|undefined}
 *   The registered definition, when the ID is supported.
 */
export function findTriggerById(id) {
  return TRIGGERS.find(trigger => trigger.id === id);
}
