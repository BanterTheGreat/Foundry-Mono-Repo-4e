import { Logger } from "../../shared/logger.js";

/**
 * Defers DnD4e 0.9.3 attack effects until the GM resolves active defense.
 */
export class PlayerDefenseEffects {
  /**
   * The system reads these mutable outcome arrays immediately after rollAttack.
   * Keep NPC targets in its workflow and remove only active defenders. Effects
   * ending when attacked must also wait for the actual defense outcome.
   *
   * @param {object} targetData DnD4e rollAttack hook payload.
   * @param {Token[]} defenders Tokens captured for active defense.
   * @returns {{autoApplyEffects: boolean, selfEffectsApplied: object}}
   *   Serializable state persisted on the replacement chat message.
   */
  static deferAttackEffects(targetData, defenders) {
    const defendedTokens = new Set(defenders);
    for (const key of ["targetHit", "targetMissed"]) {
      if (Array.isArray(targetData[key])) {
        targetData[key] = targetData[key].filter(token => !defendedTokens.has(token));
      }
    }
    return {
      autoApplyEffects: Boolean(game.settings.get("dnd4e", "autoApplyEffects")),
      selfEffectsApplied: {
        hit: Boolean(targetData.targetHit?.length),
        miss: Boolean(targetData.targetMissed?.length),
      },
    };
  }

  /**
   * Applies effects using the system API on the GM, including synthetic actors
   * from stored scene tokens. The socket queue reserves self effects once per
   * hit/miss outcome before calling this method.
   *
   * @param {object} defense Persisted playerDefense message flag.
   * @param {object} target Persisted target with its resolved outcome.
   * @param {boolean} applySelf Whether this outcome's self effects are reserved.
   * @returns {Promise<void>}
   */
  static async applyOutcomeEffects(defense, target, applySelf) {
    // Older defense messages did not defer the system effects.
    if (defense.autoApplyEffects === undefined) {
      return;
    }
    const utils = globalThis.dnd4e?.utils;
    const token = PlayerDefenseEffects.#findSceneToken(target.sceneId, target.tokenId);
    if (!token?.actor || !utils) {
      Logger.error("Could not resolve defender token for active-defense effects", { sceneId: target.sceneId, tokenId: target.tokenId });
      return;
    }
    const attackerToken = PlayerDefenseEffects.#findSceneToken(defense.sceneId, defense.attackerTokenId);
    const attacker = attackerToken?.actor ?? game.actors.get(defense.attackerId);
    const condition = target.outcome === "miss" ? "miss" : "hit";
    if (defense.autoApplyEffects) {
      const item = attacker?.items.get(defense.itemId) ?? attacker?.items.find(candidate => candidate.name === defense.itemName);
      if (item) {
        await utils.applyEffectsToTokens(item.effects, [token], condition, attacker);
        await utils.applyEffectsToTokens(item.effects, [token], "hitOrMiss", attacker);
        if (applySelf) {
          await utils.applyEffectsToTokens(item.effects, [attackerToken ?? attacker], condition === "hit" ? "selfHit" : "selfMiss", attacker);
        }
      } else {
        Logger.error("Could not find attacking item for active-defense effects", { attackerId: defense.attackerId, itemId: defense.itemId });
      }
    }
    await utils.endEffectsOnTokens([token], condition === "hit" ? "attackedhit" : "attackedmiss");
    await utils.endEffectsOnTokens([token], "attacked");
  }

  /**
   * @param {string|null} sceneId
   * @param {string|null} tokenId
   * @returns {Token|TokenDocument|null}
   */
  static #findSceneToken(sceneId, tokenId) {
    if (!tokenId) {
      return null;
    }
    const document = game.scenes?.get(sceneId)?.tokens.get(tokenId);
    if (document) {
      return document.object ?? document;
    }
    return canvas.scene?.id === sceneId ? canvas.tokens?.get(tokenId) ?? null : null;
  }
}
