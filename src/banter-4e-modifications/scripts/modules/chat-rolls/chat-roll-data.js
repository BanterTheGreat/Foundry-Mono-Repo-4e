/** Read the kept natural die, never a discarded advantage/reroll result. */
export function naturalD20(roll) {
  return (roll.dice ?? []).filter(die => die.faces === 20)
    .flatMap(die => die.results ?? []).filter(result => result.active !== false && !result.discarded && !result.rerolled)
    .map(result => result.result).filter(Number.isFinite);
}

/** Group correlated terms by source/change and damage type, retaining zero rolls. */
export function damageContributors(entries = []) {
  const groups = new Map();
  for (const entry of entries.filter(candidate => candidate.temporary && candidate.attribution === 'verified')) {
    const key = `${entry.sourceUuid}:${entry.changeIndex}:${entry.damageType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.displayFormula += ` + ${entry.displayFormula}`;
      existing.rolledContribution = Number.isFinite(existing.rolledContribution) && Number.isFinite(entry.rolledContribution)
        ? existing.rolledContribution + entry.rolledContribution : undefined;
      existing.diceResults.push(...(entry.diceResults ?? []));
    } else {
      groups.set(key, { ...entry, diceResults: [...(entry.diceResults ?? [])] });
    }
  }
  return [...groups.values()];
}

/** Build a presentation from persisted roll data only; never read live targets. */
export function describeRoll(message, roll, index = 0) {
  if (message.isContentVisible === false || !Number.isFinite(roll.total)) {
    return null;
  }
  const options = roll.options ?? {};
  const skill = index === 0 ? message.flags?.['banter-4e-modifications']?.skillCheck : null;
  const attack = options.multirollData;
  const snapshot = options.banterChatRoll;
  const kind = skill ? 'skill' : attack || options.banterAttackBuffs || options.banterAttackSource ? 'attack'
    : options.hitTypeDamage && !options.hitTypeHealing ? 'damage' : null;
  if (!kind) {
    return null;
  }
  const speaker = message.speaker?.alias || snapshot?.source?.speakerName || 'Someone';
  const source = snapshot?.source?.itemName || options.banterAttackSource?.itemName || '';
  const special = attack?.critstate || attack?.hitstate;
  const verdict = { critical: 'Critically Hit', fumble: 'Fumbled against', immune: 'could not affect', hit: 'Hit', miss: 'Missed' };
  const outcome = verdict[special] || verdict[attack?.hitstate] || 'attacked';
  const skillConfig = globalThis.CONFIG?.DND4E?.skills?.[skill?.skillId];
  const skillLabel = skill?.skillName || skillConfig?.label || skillConfig || skill?.skillId;
  const label = kind === 'skill' ? `${speaker} rolled ${globalThis.game?.i18n?.localize(String(skillLabel)) ?? skillLabel}`
    : kind === 'attack' ? `${speaker} ${outcome}${attack?.target ? ` ${attack.target}` : ''}`
    : `${speaker} deals damage${snapshot?.targetName ? ` against ${snapshot.targetName}` : ''}`;
  const divisor = kind === 'damage' ? options.divisors?.[options.hitType] : null;
  const scale = Number(divisor?.value) > 0 ? Number(divisor.value) : 1;
  const badges = skill?.badges ?? options.banterAttackBuffs ?? [];
  const exceptional = kind === 'attack' && !['critical', 'fumble', 'immune'].includes(special)
    ? badges.filter(badge => !badge.kind && (badge.decisive || badge.decisivePenalty)) : [];
  const attackOutcome = kind === 'attack'
    ? (Object.hasOwn(verdict, special) ? special : Object.hasOwn(verdict, attack?.hitstate) ? attack.hitstate : null)
    : null;
  const damageOutcome = kind === 'damage' && ['miss', 'crit'].includes(options.hitType) ? options.hitType : null;
  return { kind, label, source, attackOutcome, damageOutcome, total: kind === 'damage' ? Math.floor(roll.total / scale) : roll.total,
    attackSubject: kind === 'attack' ? `${speaker}${attack?.target ? ` → ${attack.target}` : ''}` : null,
    attackVerdict: kind === 'attack'
      ? ({ hit: 'Hit', miss: 'Miss', critical: 'Crit', fumble: 'Crit Fail', immune: 'Immune' }[attackOutcome] || 'Attack')
      : null,
    damageSubject: kind === 'damage' ? `${speaker}${snapshot?.targetName ? ` against ${snapshot.targetName}` : ''}` : null,
    natural: naturalD20(roll), badges, exceptional,
    contributors: damageContributors(snapshot?.contributors),
    scale, reasons: divisor?.reason ?? [] };
}
