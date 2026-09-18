/**
 * Produces the user-visible values for a Player Defense dialog.
 *
 * @param {{attackName: string, attackerName: string, defenseStat: string, defenseMod: number, rollDC: number}} target
 * @returns {{title: string, content: string, defendLabel: string}}
 */
export function createDefenseDialogPayload({ attackName, attackerName, defenseStat, defenseMod, rollDC }) {
  return {
    title: attackName,
    content: `<p><b>${attackerName}</b> is targeting your <b>${defenseStat}</b> (+${defenseMod})!</p>`,
    defendLabel: `Defend Yourself! (DC ${rollDC})`,
  };
}
