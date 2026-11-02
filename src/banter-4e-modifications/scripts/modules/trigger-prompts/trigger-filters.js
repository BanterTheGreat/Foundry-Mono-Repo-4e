/** Values persisted by the trigger configuration dialog. */
export const ATTACK_TYPES = ["melee", "ranged", "close", "area"];
export const DEFENSE_TYPES = ["ac", "fort", "ref", "wil"];
export const DAMAGE_TYPES = ["acid", "cold", "fire", "force", "lightning", "necrotic", "physical", "poison", "psychic", "radiant", "thunder"];

/** Classify the effective power range, including the native weapon range. */
export function attackTypeOf(range) {
  const value = String(range ?? "").toLowerCase();
  if (["weapon", "melee", "touch", "reach"].includes(value) || /^melee\b/.test(value)) {
    return "melee";
  }
  if (/^(?:range|ranged)\b/.test(value)) {
    return "ranged";
  }
  if (/^close/.test(value)) {
    return "close";
  }
  if (/^area|^wall/.test(value)) {
    return "area";
  }
  return null;
}

/** Optional filters fail closed when an event has no corresponding metadata. */
export function matchesTriggerFilters(parameters, context) {
  for (const [key, values, actual] of [
    ["attackTypes", ATTACK_TYPES, [context.attackType]],
    ["defenseTypes", DEFENSE_TYPES, [context.defenseType]],
    ["damageTypes", DAMAGE_TYPES, context.damageTypes ?? []],
  ]) {
    const selected = parameters[key];
    if (Array.isArray(selected) && selected.length && !selected.some(value => values.includes(value) && actual.includes(value))) {
      return false;
    }
  }
  if (parameters.companionActorUuid && parameters.companionActorUuid !== context.companionActorUuid) {
    return false;
  }
  if (context.requiresCompanion && !parameters.companionActorUuid) {
    return false;
  }
  return true;
}
