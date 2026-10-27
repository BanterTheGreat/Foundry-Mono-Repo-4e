/** Escape document names and numeric labels; authored effect/roll HTML stays enriched. */
function escapeLabel(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/**
 * Replace a pending card by identity rather than its serialized inner markup.
 * Pending cards contain no nested sections; resolved enriched rolls may, so
 * only use this boundary search for a target that has not resolved yet.
 * @returns {string} Updated persisted content, or unchanged content if absent.
 */
export function replacePendingDefenseCard(content, targetId, resultHtml) {
  const sections = /<section\b[^>]*>[\s\S]*?<\/section\s*>/gi;
  const identity = escapeLabel(targetId);
  return content.replace(sections, section => {
    const openingTag = section.slice(0, section.indexOf('>') + 1);
    const attribute = openingTag.match(/\bdata-player-defense-target\s*=\s*(["'])(.*?)\1/i);
    return attribute?.[2] === identity ? resultHtml : section;
  });
}

/**
 * Render one independent target. Resolved HTML is persisted by the GM, while
 * disclosure state remains local to the browser. Outcome names retain enemy semantics.
 * @param {object} target Captured defense target, including required rollDC.
 * @param {string} attackName Captured power name.
 * @param {{outcome: string, total: number, natural: number, rollHtml: string}|null} result
 * @returns {string}
 */
export function renderDefenseTarget(target, attackName, result = null) {
  const tone = !result ? 'pending' : result.outcome === 'critical' ? 'critical' : result.outcome === 'miss' ? 'evaded' : 'hit';
  const verdict = { pending: 'WAITING', critical: 'CRIT HIT', evaded: 'EVADED', hit: 'HIT' }[tone];
  const text = result ? result.outcome === 'miss' ? target.missText : target.hitText : '';
  const hasText = String(text ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
  const effect = hasText ? `<div class="banter-defense__effect"><strong>${result.outcome === 'miss' ? 'MISS EFFECT' : 'HIT EFFECT'}</strong><div>${text}</div></div>` : '';
  const details = result ? `<div class="banter-defense__calculation"><div>Natural ${escapeLabel(result.natural)} · Required DC ${escapeLabel(target.rollDC)}</div>${result.rollHtml}</div>` : '<div class="banter-defense__calculation">Awaiting defense roll.</div>';
  return `<section class="banter-defense banter-defense--${tone}" data-player-defense-target="${escapeLabel(target.id)}"><details><summary><div class="banter-defense__verdict"><strong>${verdict}</strong><small>${result ? `Total ${escapeLabel(result.total)}` : 'Not rolled'}</small></div><div class="banter-defense__identity"><strong>${escapeLabel(target.actorName)} defends</strong><div>${escapeLabel(attackName)} · ${escapeLabel(target.defenseStat)}</div></div><div class="banter-defense__dc"><small>DC</small><strong>${escapeLabel(target.rollDC)}</strong></div><span class="banter-defense__chevron" aria-hidden="true">›</span></summary>${details}</details>${effect}</section>`;
}


/**
 * Render the managed session from persisted results, including its ordinary NPC targets.
 * @param {object} defense GM-persisted playerDefense flag.
 * @param {string[]} targetIds Remaining automation target identities.
 * @returns {string}
 */
export function renderManagedDefenseContent(defense, targetIds) {
  const native = (defense.nativeResults ?? []).filter(result => targetIds.includes(result.tokenId)).map(result =>
    `<section class="banter-defense"><strong>${escapeLabel(result.name)}</strong> &middot; ${escapeLabel(result.total)} &middot; ${escapeLabel(result.label)}</section>`,
  ).join("");
  return native + defense.targets.filter(target => targetIds.includes(target.tokenId)).map(target => renderDefenseTarget(
    { ...target, rollDC: target.rollDC + (target.postAttackModifier ?? 0) }, defense.attackName,
    target.resolved ? { outcome: target.outcome, total: target.total, natural: target.natural, rollHtml: target.rollHtml ?? "" } : null,
  )).join("");
}


/**
 * Reconstruct a mixed session card from current native rolls and persisted defense rolls.
 * Safe during chat-history rendering before the ready hook creates game.PlayerDefense.
 * @param {ChatMessage} message Session message.
 * @param {string[]} targetIds Remaining scene-token IDs.
 * @returns {string}
 */
export function renderManagedDefenseMessage(message, targetIds) {
  const defense = message.flags.playerDefense;
  const nativeResults = (message.rolls ?? []).filter(roll => !roll.options?.banterDefenseTarget).map(roll => {
    const attack = roll.options.multirollData;
    const outcome = ["critical", "fumble", "immune"].includes(attack.critstate) ? attack.critstate : attack.hitstate;
    return { tokenId: attack.targetID, name: defense.nativeResults?.find(result => result.tokenId === attack.targetID)?.name ?? "Target",
      total: roll.total, label: { hit: "HIT", miss: "MISS", critical: "CRIT", fumble: "CRIT FAIL", immune: "IMMUNE" }[outcome] ?? "ATTACK" };
  });
  return renderManagedDefenseContent({ ...defense, nativeResults }, targetIds);
}
