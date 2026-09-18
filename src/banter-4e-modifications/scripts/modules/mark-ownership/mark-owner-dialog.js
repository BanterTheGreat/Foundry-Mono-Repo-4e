import { MARKER_CHANGE_KEY } from "./constants.js";

/**
 * Presents the applying user with the token-combatant that owns a Mark.
 */
export class MarkOwnerDialog {
  /**
   * Opens the owner picker and resolves once the user applies or dismisses it.
   * The current combatant is preselected when eligible; the existing DnD4e
   * marker change is used as a fallback.
   *
   * @param {ActiveEffect} effect
   *   Mark effect whose parent actor is named in the dialog.
   * @param {Token[]} candidates
   *   Other token-combatants eligible to own the Mark.
   * @returns {Promise<object|null>}
   *   Selected owner references, or null when the dialog is cancelled.
   */
  static chooseMarkOwner(effect, candidates) {
    const inferredOwner = effect.changes.find(change => change.key === MARKER_CHANGE_KEY)?.value;
    const activeCombatantTokenId = game.combat?.combatant?.tokenId;
    const currentTokenId = candidates.some(token => token.id === activeCombatantTokenId) ? activeCombatantTokenId : null;
    const options = candidates.map(token => {
      const isSelected = token.id === currentTokenId || (!currentTokenId && token.actor.uuid === inferredOwner);
      const selected = isSelected ? " selected" : "";
      return `<option value="${token.id}"${selected}>${foundry.utils.escapeHTML(token.name)}</option>`;
    }).join("");
    const content = `<form><div class="form-group"><label>Mark owner</label><div class="form-fields"><select name="ownerTokenId">${options}</select></div></div></form>`;

    return MarkOwnerDialog.#showOwnerSelectionDialog(effect, candidates, content);
  }

  /** @param {ActiveEffect} effect @param {Token[]} candidates @param {string} content */
  static #showOwnerSelectionDialog(effect, candidates, content) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = value => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };
      new foundry.applications.api.DialogV2({
        window: { title: `Choose Mark owner for ${effect.parent.name}` },
        content,
        buttons: [
          {
            action: "apply",
            icon: "fas fa-check",
            label: "Apply",
            default: true,
            callback: (event, button, dialog) => {
              const tokenId = dialog.element.querySelector('[name="ownerTokenId"]')?.value;
              const token = candidates.find(candidate => candidate.id === tokenId);
              finish(token ? MarkOwnerDialog.#createOwnerReference(token) : null);
            },
          },
          { action: "cancel", icon: "fas fa-times", label: "Cancel", callback: () => finish(null) },
        ],
        close: () => finish(null),
      }).render({ force: true });
    });
  }

  /**
   * Converts the chosen canvas token into serializable ownership references.
   * Target references are added later by the GM-authoritative store.
   *
   * @param {Token} owner
   *   Token selected as the Mark owner.
   * @returns {object}
   *   Actor, token, scene, and combat identifiers safe to send via SocketLib.
   */
  static #createOwnerReference(owner) {
    return {
      actorUuid: owner.actor.uuid,
      ownerSceneId: owner.scene.id,
      ownerTokenId: owner.id,
      combatId: game.combat.id,
    };
  }
}
