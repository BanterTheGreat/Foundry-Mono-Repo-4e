/**
 * DnD4e 0.9.3 stacks untyped modifiers and keeps the largest typed modifier.
 * Parsing intentionally matches Roll4e.processBonuses.
 */
export function totalBonuses(bonuses = {}) {
  return Object.entries(bonuses).reduce((total, [type, values]) => {
    const numbers = values.map(value => parseInt(value));
    return total + (numbers.length ? type === "untyped" ? numbers.reduce((sum, value) => sum + value, 0) : Math.max(...numbers) : 0);
  }, 0);
}

/**
 * Calculate the counterfactual using the actual roll's bonuses, preserving
 * macro-added modifiers. Reject types whose replay disagrees with the roll.
 */
export function findBonusLoss(actual, before, after, uncertainTypes = new Set()) {
  let loss = 0;
  for (const type of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const initial = totalBonuses({ [type]: before[type] ?? [] });
    const remaining = totalBonuses({ [type]: after[type] ?? [] });
    if (initial === remaining) {
      continue;
    }
    if (uncertainTypes.has(type) || totalBonuses({ [type]: actual[type] ?? [] }) !== initial) {
      return null;
    }
    loss += initial - remaining;
  }
  return loss;
}

/**
 * Resolve each badge against its own target. Critical/fumble/immune outcomes
 * cannot be changed by removing a flat attack modifier.
 */
export function resolveBuffBadges(badges, total, defense, critState = "", hitState = "") {
  const ordinaryHit = !critState && hitState === "hit" && Number.isFinite(defense) && total >= defense;
  const ordinaryMiss = !critState && hitState === "miss" && Number.isFinite(defense) && total < defense;
  return badges.map(badge => ({
    ...badge,
    decisive: ordinaryHit && badge.loss > 0 && total - badge.loss < defense,
    decisivePenalty: ordinaryMiss && badge.loss < 0 && total - badge.loss >= defense,
  }));
}
