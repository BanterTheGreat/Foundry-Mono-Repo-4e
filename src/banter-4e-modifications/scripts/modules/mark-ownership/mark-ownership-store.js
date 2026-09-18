import { MODULE_NAME } from "../../shared/globals.js";
import { isMark, MARKER_CHANGE_KEY, OWNERSHIP_FLAG } from "./constants.js";

/**
 * Owns persistent Mark relationships and validates GM-authoritative mutations.
 */
export class MarkOwnershipStore {
  /**
   * Validates and persists a batch of owner selections on the GM client. Each
   * accepted Mark replaces every other Mark variant on its target. Cancelling
   * removes marker metadata but deliberately leaves the new Mark ownerless.
   *
   * @param {object[]} assignments
   *   Effect and target references captured by the applying client.
   * @param {object|null} owner
   *   Selected owner references, or null when selection was cancelled.
   * @returns {Promise<boolean>}
   *   True after every resolvable assignment in the batch has been processed.
   */
  static async assignOwnersToMarks(assignments, owner) {
    for (const assignment of assignments) {
      const effect = await fromUuid(assignment.effectUuid);
      if (!effect || !isMark(effect)) {
        continue;
      }

      const validatedTarget = MarkOwnershipStore.#validateOwnershipAssignment(effect, assignment, owner);
      if (!validatedTarget) {
        if (!game.combats.get(assignment.combatId)?.started) {
          await effect.delete();
        }
        continue;
      }

      const otherMarks = effect.parent.effects.filter(candidate => candidate.id !== effect.id && isMark(candidate));
      await Promise.all(otherMarks.map(candidate => candidate.delete()));

      const changes = effect.changes.filter(change => change.key !== MARKER_CHANGE_KEY);
      if (!owner) {
        await effect.update({ changes, [`flags.${MODULE_NAME}.${OWNERSHIP_FLAG}`]: null });
        continue;
      }

      changes.push({ key: MARKER_CHANGE_KEY, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: owner.actorUuid, priority: null });
      await effect.update({
        changes,
        [`flags.${MODULE_NAME}.${OWNERSHIP_FLAG}`]: {
          ...owner,
          targetSceneId: validatedTarget.targetSceneId,
          targetTokenId: validatedTarget.targetTokenId,
        },
      });
    }
    return true;
  }

  /**
   * Deletes managed Marks for which the exact token is either endpoint. Actor
   * identity alone is insufficient because an actor may have several tokens.
   *
   * @param {string} sceneId
   *   Scene containing the combatant token.
   * @param {string} tokenId
   *   Token belonging to the combatant that left combat.
   * @returns {Promise<void>}
   *   Resolves after all matching Mark effects have been deleted.
   */
  static async removeMarksForCombatant(sceneId, tokenId) {
    await MarkOwnershipStore.#deleteManagedMarksMatching(ownership =>
      (ownership.ownerSceneId === sceneId && ownership.ownerTokenId === tokenId) ||
      (ownership.targetSceneId === sceneId && ownership.targetTokenId === tokenId));
  }

  /**
   * Deletes every managed Mark created for a combat encounter.
   *
   * @param {string} combatId
   *   Encounter that ended or was deleted.
   * @returns {Promise<void>}
   *   Resolves after all matching Mark effects have been deleted.
   */
  static async removeMarksForCombat(combatId) {
    await MarkOwnershipStore.#deleteManagedMarksMatching(ownership => ownership.combatId === combatId);
  }

  /**
   * Collects managed Marks represented on the current canvas. Effects are
   * deduplicated because linked actors may be represented by multiple tokens.
   *
   * @returns {ActiveEffect[]}
   *   Unique Mark effects carrying this module's ownership flag.
   */
  static getCurrentSceneMarkEffects() {
    const effects = canvas.tokens.placeables.flatMap(token => token.actor?.effects?.filter(effect =>
      isMark(effect) && effect.getFlag(MODULE_NAME, OWNERSHIP_FLAG)) ?? []);
    return Array.from(new Map(effects.map(effect => [effect.uuid, effect])).values());
  }

  /**
   * Resolves the exact owner token stored on a target's managed Mark.
   *
   * @param {TokenDocument} target
   *   Marked token whose relationship should be inspected.
   * @returns {TokenDocument|null}
   *   Stored owner token, or null for an ownerless or stale relationship.
   */
  static findOwnerForTarget(target) {
    const effect = target.actor?.effects.find(candidate => {
      const ownership = candidate.getFlag(MODULE_NAME, OWNERSHIP_FLAG);
      return isMark(candidate) &&
        ownership?.combatId === game.combat?.id &&
        ownership.targetSceneId === target.parent.id &&
        ownership.targetTokenId === target.id;
    });
    const ownership = effect?.getFlag(MODULE_NAME, OWNERSHIP_FLAG);
    return game.scenes.get(ownership?.ownerSceneId)?.tokens.get(ownership?.ownerTokenId) ?? null;
  }

  /**
   * Treats SocketLib arguments as untrusted and confirms that the effect,
   * target, owner, and active combat all describe the same relationship.
   *
   * @param {ActiveEffect} effect
   *   Mark effect the GM was asked to update.
   * @param {object} assignment
   *   Effect, combat, scene, and marked-token identifiers from the client.
   * @param {object|null} owner
   *   Proposed owner identifiers, or null for an ownerless Mark.
   * @returns {object|null}
   *   Canonical target identifiers when valid, otherwise null.
   */
  static #validateOwnershipAssignment(effect, assignment, owner) {
    const combat = game.combats.get(assignment.combatId);
    const scene = game.scenes.get(assignment.targetSceneId);
    const targetToken = scene?.tokens.get(assignment.targetTokenId);
    const targetCombatant = combat?.combatants.find(candidate =>
      candidate.sceneId === assignment.targetSceneId && candidate.tokenId === assignment.targetTokenId);
    if (!combat?.started || !targetToken || !targetCombatant || targetToken.actor?.uuid !== effect.parent?.uuid) {
      return null;
    }

    if (owner) {
      const ownerScene = game.scenes.get(owner.ownerSceneId);
      const ownerToken = ownerScene?.tokens.get(owner.ownerTokenId);
      const ownerCombatant = combat.combatants.find(candidate =>
        candidate.sceneId === owner.ownerSceneId && candidate.tokenId === owner.ownerTokenId);
      if (!ownerToken || !ownerCombatant || ownerToken.actor?.uuid !== owner.actorUuid || ownerToken.id === targetToken.id) {
        return null;
      }
    }

    return { targetSceneId: targetToken.parent.id, targetTokenId: targetToken.id };
  }

  /**
   * Finds managed Marks across world and synthetic token actors, then deletes
   * those whose stored relationship satisfies the supplied lifecycle predicate.
   *
   * @param {(ownership: object) => boolean} predicate
   *   Selects ownership records which must be removed.
   * @returns {Promise<void>}
   *   Resolves after the effects are deleted and the canvas is redrawn.
   */
  static async #deleteManagedMarksMatching(predicate) {
    const actors = [
      ...game.actors,
      ...Array.from(game.scenes).flatMap(scene => scene.tokens.map(token => token.actor).filter(Boolean)),
    ];
    const effectsByUuid = new Map(actors.flatMap(actor => actor.effects).map(effect => [effect.uuid, effect]));
    const effects = Array.from(effectsByUuid.values()).filter(effect => {
      const ownership = effect.getFlag(MODULE_NAME, OWNERSHIP_FLAG);
      return ownership && isMark(effect) && predicate(ownership);
    });
    await Promise.all(effects.map(effect => effect.delete()));
    game.MarkOwnership?.redrawRelationships();
  }
}
