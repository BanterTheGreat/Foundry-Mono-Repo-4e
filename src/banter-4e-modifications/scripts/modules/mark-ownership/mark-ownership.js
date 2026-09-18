import { isMark, MARKER_CHANGE_KEY } from "./constants.js";
import { MarkOwnerDialog } from "./mark-owner-dialog.js";
import { MarkOwnershipRenderer } from "./mark-ownership-renderer.js";
import { MarkOwnershipStore } from "./mark-ownership-store.js";
import { ENABLE_MARK_OWNERSHIP, MODULE_NAME } from "../../shared/globals.js";

/**
 * Coordinates Foundry lifecycle hooks for Mark ownership.
 */
export class MarkOwnership {
  static pendingMarkEffects = [];
  static pendingPromptFlush = null;

  /**
   * Creates the hook coordinator and attaches its renderer to the current canvas.
   *
   * @param {SocketlibSocket} socket
   *   Registered module socket used for GM-authoritative mutations.
   */
  constructor(socket) {
    this.socket = socket;
    this.relationshipRenderer = new MarkOwnershipRenderer();
    this.relationshipRenderer.attachToCanvas();
    this.redrawRelationships();
  }

  /**
   * Queues created Marks so one synchronous multi-target action shares a dialog.
   * Effects created by another user, outside combat, or on a non-combatant are
   * ignored.
   *
   * @param {ActiveEffect} effect
   *   ActiveEffect reported by Foundry's create hook.
   * @param {object} options
   *   Foundry creation options; currently unused.
   * @param {string} userId
   *   ID of the user who initiated creation.
   */
  static onCreateActiveEffect(effect, options, userId) {
    if (!game.settings.get(MODULE_NAME, ENABLE_MARK_OWNERSHIP) || userId !== game.user.id || !isMark(effect)) {
      return;
    }

    const markContext = MarkOwnership.#captureCombatMarkContext(effect);
    if (!markContext) {
      return;
    }

    MarkOwnership.pendingMarkEffects.push({ effectUuid: effect.uuid, context: markContext });
    if (!MarkOwnership.pendingPromptFlush) {
      MarkOwnership.pendingPromptFlush = setTimeout(() => MarkOwnership.#flushPendingMarkEffects(), 0);
    }
  }

  /**
   * Handles effect and token visual-state hooks by requesting a redraw from the
   * active coordinator, if the feature was initialized.
   */
  static onRelationshipVisualStateChanged() {
    game.MarkOwnership?.redrawRelationships();
  }

  /**
   * Requests cleanup when a combatant is removed. Only the initiating client
   * sends the SocketLib request so multiple clients do not duplicate it.
   *
   * @param {Combatant} combatant
   *   Combatant being removed.
   * @param {object} options
   *   Foundry deletion options; currently unused.
   * @param {string} userId
   *   ID of the user who initiated deletion.
   * @returns {Promise<void>}
   *   Resolves after any required GM cleanup request completes.
   */
  static async onDeleteCombatant(combatant, options, userId) {
    if (userId === game.user.id) {
      await MarkOwnership.#requestGmCleanup("removeMarksForCombatant", combatant.sceneId, combatant.tokenId);
    }
  }

  /**
   * Requests cleanup when a token is deleted, covering deletion outside the
   * combat tracker. Only the initiating client sends the request.
   *
   * @param {TokenDocument} token
   *   Token document being deleted.
   * @param {object} options
   *   Foundry deletion options; currently unused.
   * @param {string} userId
   *   ID of the user who initiated deletion.
   * @returns {Promise<void>}
   *   Resolves after any required GM cleanup request completes.
   */
  static async onDeleteToken(token, options, userId) {
    if (userId === game.user.id) {
      await MarkOwnership.#requestGmCleanup("removeMarksForCombatant", token.parent?.id, token.id);
    }
  }

  /**
   * Removes Marks associated with an encounter when Foundry emits combatEnd.
   * The active GM acts directly so the hook fires only one destructive cleanup.
   *
   * @param {Combat} combat
   *   Encounter which has ended.
   * @returns {Promise<void>}
   *   Resolves after the encounter's managed Marks are deleted.
   */
  static async onCombatEnd(combat) {
    if (game.users.activeGM?.id === game.user.id) {
      await MarkOwnershipStore.removeMarksForCombat(combat.id);
    }
  }

  /**
   * Requests cleanup when the Combat document itself is deleted.
   *
   * @param {Combat} combat
   *   Combat document being deleted.
   * @param {object} options
   *   Foundry deletion options; currently unused.
   * @param {string} userId
   *   ID of the user who initiated deletion.
   * @returns {Promise<void>}
   *   Resolves after any required GM cleanup request completes.
   */
  static async onDeleteCombat(combat, options, userId) {
    if (userId === game.user.id) {
      await MarkOwnership.#requestGmCleanup("removeMarksForCombat", combat.id);
    }
  }

  /**
   * Recreates the scene-specific graphics layer after canvas initialization and
   * immediately restores any lines whose endpoint is already interactive.
   */
  static onCanvasReady() {
    const markOwnership = game.MarkOwnership;
    if (markOwnership) {
      markOwnership.relationshipRenderer.attachToCanvas();
      markOwnership.redrawRelationships();
    }
  }

  /**
   * Releases PIXI resources before Foundry destroys the current canvas.
   */
  static onCanvasTearDown() {
    const markOwnership = game.MarkOwnership;
    if (markOwnership) {
      markOwnership.relationshipRenderer.destroyGraphicsLayer();
    }
  }

  /**
   * Redraws visible Mark relationships using the current token state.
   */
  redrawRelationships() {
    this.relationshipRenderer.drawRelationships();
  }

  /**
   * Drains queued Mark creations, prompts once per safe batch, and sends each
   * resulting owner selection to the GM-authoritative store.
   *
   * @returns {Promise<void>}
   *   Resolves after every queued batch has been handled.
   */
  static async #flushPendingMarkEffects() {
    const pending = MarkOwnership.pendingMarkEffects.splice(0);
    MarkOwnership.pendingPromptFlush = null;

    for (const group of MarkOwnership.#groupPendingMarkEffects(pending)) {
      const firstEffect = await fromUuid(group.assignments[0].effectUuid);
      if (!firstEffect) {
        continue;
      }
      const candidates = MarkOwnership.#findOwnerCandidates(group.context);
      const owner = candidates.length ? await MarkOwnerDialog.chooseMarkOwner(firstEffect, candidates) : null;
      if (game.MarkOwnership?.socket) {
        await game.MarkOwnership.socket.executeAsGM("setMarkOwner", group.assignments, owner);
      } else {
        await MarkOwnershipStore.assignOwnersToMarks(group.assignments, owner);
      }
    }
  }

  /**
   * Groups effects from the same synchronous action when combat, scene, and
   * inferred owner match. Target references remain individual within the batch.
   *
   * @param {object[]} pending
   *   Queued effect UUIDs and their captured combat contexts.
   * @returns {object[]}
   *   Dialog groups containing assignments and a shared selection context.
   */
  static #groupPendingMarkEffects(pending) {
    const groups = new Map();
    for (const entry of pending) {
      const inferredOwner = entry.context.inferredOwnerActorUuid ?? "";
      const key = `${entry.context.combatId}:${entry.context.sceneId}:${inferredOwner}`;
      const group = groups.get(key) ?? { assignments: [], context: entry.context };
      group.assignments.push({
        effectUuid: entry.effectUuid,
        combatId: entry.context.combatId,
        targetSceneId: entry.context.sceneId,
        targetTokenId: entry.context.targetTokenId,
      });
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }

  /**
   * Resolves the marked token and confirms it belongs to the active encounter.
   * Controlled linked tokens are preferred when an actor has multiple tokens.
   *
   * @param {ActiveEffect} effect
   *   Newly-created Mark effect.
   * @returns {object|null}
   *   Captured combat context, or null when prompting must not occur.
   */
  static #captureCombatMarkContext(effect) {
    const combatSceneId = typeof game.combat?.scene === "string" ? game.combat.scene : game.combat?.scene?.id;
    if (!game.combat?.started || (combatSceneId && combatSceneId !== canvas.scene?.id)) {
      return null;
    }
    const matchingTokens = canvas.tokens.placeables.filter(token => token.actor === effect.parent);
    const targetToken = effect.parent?.token?.object ?? matchingTokens.find(token => token.controlled) ?? matchingTokens[0];
    const targetCombatant = targetToken && game.combat.combatants.find(combatant =>
      combatant.sceneId === canvas.scene.id && combatant.tokenId === targetToken.id);
    if (!targetCombatant) {
      return null;
    }
    return {
      combatId: game.combat.id,
      sceneId: canvas.scene.id,
      targetTokenId: targetToken.id,
      inferredOwnerActorUuid: effect.changes.find(change => change.key === MARKER_CHANGE_KEY)?.value,
    };
  }

  /**
   * Builds the selectable owner list from other token-combatants in the same
   * scene, sorted by token name for stable presentation.
   *
   * @param {object} context
   *   Combat and marked-token context for the pending effect group.
   * @returns {Token[]}
   *   Eligible owner token objects.
   */
  static #findOwnerCandidates(context) {
    return game.combat.combatants
      .filter(combatant => combatant.sceneId === context.sceneId && combatant.tokenId !== context.targetTokenId)
      .map(combatant => canvas.tokens.get(combatant.tokenId))
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Routes lifecycle deletion through a GM when SocketLib is available. The
   * direct fallback is limited to the current user already being a GM.
   *
   * @param {string} action
   *   Registered cleanup action to execute.
   * @param {...unknown} args
   *   Serializable action arguments forwarded to the ownership store.
   * @returns {Promise<void>}
   *   Resolves after the remote or local cleanup finishes.
   */
  static async #requestGmCleanup(action, ...args) {
    if (game.MarkOwnership?.socket) {
      await game.MarkOwnership.socket.executeAsGM(action, ...args);
    } else if (game.user.isGM) {
      if (action === "removeMarksForCombatant") {
        await MarkOwnershipStore.removeMarksForCombatant(...args);
      } else if (action === "removeMarksForCombat") {
        await MarkOwnershipStore.removeMarksForCombat(...args);
      }
    }
  }
}
