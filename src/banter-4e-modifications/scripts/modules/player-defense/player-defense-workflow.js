/**
 * Produces the user-visible values for a Player Defense dialog.
 *
 * @param {{attackName: string, attackerName: string, defenseStat: string, defenseMod: number, rollDC: number, attackModifier: number, baseDefense: number, reversedRollOffset: number, hitText?: string, missText?: string}} target
 * @returns {{title: string, content: string, defendLabel: string}}
 */
export function createDefenseDialogPayload({ attackName, attackerName, defenseStat, defenseMod, rollDC, attackModifier, baseDefense, reversedRollOffset, hitText = "", missText = "" }) {
  const defenseValue = baseDefense + defenseMod;
  const formatSignedNumber = value => value >= 0 ? `+${value}` : `${value}`;
  const defenseCheckName = {
    ac: "Armor",
    fort: "Fortitude",
    fortitude: "Fortitude",
    ref: "Reflex",
    reflex: "Reflex",
    will: "Willpower",
    willpower: "Willpower",
  }[defenseStat.toLowerCase()] ?? defenseStat;
  const failureText = createPlayerFacingEffectText(hitText, "The attack hits.");
  const successText = createPlayerFacingEffectText(missText, "Nothing happens.");

  return {
    title: `${attackerName} - ${attackName}`,
    content: `
      <section class="player-defense-dialog">
        <details class="player-defense-dialog__breakdown">
          <summary class="player-defense-dialog__check" aria-label="Show defense and DC breakdown">
            <span class="player-defense-dialog__eyebrow">${defenseCheckName} check</span>
            <strong>DC ${rollDC}</strong>
            <span class="player-defense-dialog__check-instruction">Roll 1d20 + ${defenseMod} to defend</span>
            <span class="player-defense-dialog__disclosure-icon" aria-hidden="true"></span>
          </summary>
          <div class="player-defense-dialog__math-section">
            <div><span>Your ${defenseStat}</span><b>${defenseValue}</b></div>
            <div><span>Base defense</span><b>-${baseDefense}</b></div>
            <div class="player-defense-dialog__total"><span>Defense bonus</span><b>${formatSignedNumber(defenseMod)}</b></div>
          </div>
          <div class="player-defense-dialog__math-section">
            <div><span>Base DC</span><b>${baseDefense}</b></div>
            <div><span>Attack modifier</span><b>${formatSignedNumber(attackModifier)}</b></div>
            <div><span>Reversal adjustment</span><b>${formatSignedNumber(reversedRollOffset)}</b></div>
            <div class="player-defense-dialog__total"><span>Target difficulty</span><b>DC ${rollDC}</b></div>
          </div>
        </details>
        <section class="player-defense-dialog__outcomes">
          <h3>Consequences</h3>
          <div class="player-defense-dialog__outcome player-defense-dialog__outcome--failure"><strong>On failure</strong><div>${failureText}</div></div>
          <div class="player-defense-dialog__outcome player-defense-dialog__outcome--success"><strong>On success</strong><div>${successText}</div></div>
        </section>
      </section>`,
    defendLabel: "Defend Yourself",
  };
}

/**
 * Changes a DnD4e effect written for the attacking actor into text a defender
 * can read naturally. “Your character” keeps the original third-person verb
 * form, unlike replacing “the target” directly with “you”.
 *
 * @param {string} effectText
 * @param {string} fallbackText
 * @returns {string}
 */
function createPlayerFacingEffectText(effectText, fallbackText) {
  const text = effectText.trim() || fallbackText;
  return text.replace(/\bthe target\b/gi, match => {
    if (match === match.toUpperCase()) {
      return "YOUR CHARACTER";
    }

    return match[0] === match[0].toUpperCase() ? "Your character" : "your character";
  });
}
