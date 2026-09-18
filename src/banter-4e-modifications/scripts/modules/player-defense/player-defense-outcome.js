/**
 * Converts Player Defense's defense-roll terminology into the attack-result
 * terminology consumed by Trigger Prompts.
 *
 * @param {"normal"|"critical"|"miss"} defenseOutcome
 * @returns {"hit"|"miss"}
 */
export function toTriggerAttackOutcome(defenseOutcome) {
  return defenseOutcome === "miss" ? "miss" : "hit";
}
