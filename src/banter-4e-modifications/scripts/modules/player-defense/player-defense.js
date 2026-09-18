import { Logger } from "../../shared/logger.js";
import { createDefenseDialogPayload } from "./player-defense-workflow.js";

/**
 * Handles NPC attack interception and the player-defense dialog workflow.
 */
export class PlayerDefense {
  static BASE_DEFENSE = 10;
  static REVERSED_ROLL_OFFSET = 2;
  static CRITICAL_FAILURE = 1;
  static CRITICAL_SUCCESS = 20;
  lastAttack = { item: "", targets: [], attacker: null };

    /**
     * @param {ChatMessage} message
     * @param {{item: Item}} attack
     * @returns {boolean}
     */
  static #isMatchingAttackMessage(message, attack) {
    return message.flavor.includes(attack.item.name) && message.rolls[0] !== undefined;
  }

    /**
     * @param {string} rollFormula
     * @returns {{rollModifiers: number[], totalModifier: number}}
     */
  static #getAttackRollData(rollFormula) {
    const rollModifiers = rollFormula.replace(/\d+d\d+/g, '').match(/[-+]?\d+/g)?.map(Number) || [];
    return { rollModifiers, totalModifier: rollModifiers.reduce((sum, num) => sum + num, 0) };
  }

    /**
     * @param {number} totalModifier
     * @returns {number}
     */
  static #getDefenseDC(totalModifier) {
    return PlayerDefense.BASE_DEFENSE + totalModifier + PlayerDefense.REVERSED_ROLL_OFFSET;
  }

    /**
     * Selects the first active player owner, or the first active GM as a fallback.
     *
     * @param {Actor} actor
     * @returns {User|null}
     */
  static #getEligibleUser(actor) {
    const player = game.users.find(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
    return player ?? game.users.find(user => user.active && user.isGM) ?? null;
  }

    /**
     * @param {Array<{token: Token, defenseMod: number}>} targets
     * @param {number} rollDC
     * @param {number} attackModifier
     * @param {Actor} attacker
     * @param {string} defenseStat
     * @param {Item} item
     * @returns {object[]}
     */
    static #buildDefenseTargets(targets, rollDC, attackModifier, attacker, defenseStat, item) {
    const { hit, miss } = PlayerDefense.#getPowerDamageData(item);
    return targets.map((target, index) => {
      const actor = target.token.actor;
      const assignedUser = PlayerDefense.#getEligibleUser(actor);
      Logger.info("Selected defense-dialog recipient", {
        actorId: actor.id,
        tokenId: target.token.id,
        sceneId: target.token.document?.parent?.id ?? target.token.scene?.id ?? canvas.scene?.id ?? null,
        actorName: actor.name,
        userId: assignedUser?.id ?? null,
        userName: assignedUser?.name ?? null,
        isGmFallback: assignedUser?.isGM ?? false,
      });
      return {
        id: `${actor.id}-${index}`,
        actorId: actor.id,
        tokenId: target.token.id,
        sceneId: target.token.document?.parent?.id ?? target.token.scene?.id ?? canvas.scene?.id ?? null,
        actorName: actor.name,
                attackerName: attacker.name,
                defenseStat,
                defenseMod: target.defenseMod,
                rollDC,
                attackModifier,
                baseDefense: PlayerDefense.BASE_DEFENSE,
                reversedRollOffset: PlayerDefense.REVERSED_ROLL_OFFSET,
                hitText: hit.detail ?? "",
                missText: miss.detail ?? "",
                assignedUserId: assignedUser?.id ?? null,
                dialogAttempted: false,
                resolved: false,
      };
    });
  }

    /**
     * @param {{id: string, actorName: string}} target
     * @returns {string}
     */
  static #targetMarker(target) {
        return `<span data-player-defense-result="${target.id}"><em>Awaiting defense...</em></span>`;
  }

    /**
     * Builds the public, non-interactive chat content.
     *
     * @param {object[]} targets
     * @param {object} attackContext
     * @returns {string}
     */
  static #buildDefenseChatContent(targets) {
    return targets.map(target => `
            <div class="target" data-player-defense-target="${target.id}">
                <span>${target.actorName} (+${target.defenseMod}) defends!</span>
                <p>${PlayerDefense.#targetMarker(target)}</p>
            </div>`).join("<br />");
  }

    /**
     * Reads power data across the legacy DnD4e data-model accessors used by
     * Foundry v12 and v13.
     *
     * @param {Item} item
     * @returns {{attack: object, hit: object, miss: object}}
     */
  static #getPowerDamageData(item) {
    const system = item.system ?? item.data?.data ?? {};
    return {
      attack: item.attack ?? system.attack ?? {},
      hit: item.hit ?? system.hit ?? {},
      miss: item.miss ?? system.miss ?? {},
    };
  }

    /**
     * Creates the replacement chat message for an intercepted NPC attack.
     *
     * @param {Actor} attacker
     * @param {Item} item
     * @param {object[]} targets
     */
  static #createDefenseMessage(attacker, item, targets, attackContext) {
    const { attack, hit, miss } = PlayerDefense.#getPowerDamageData(item);
    const system = item.system ?? item.data?.data ?? {};
    const hasDamage = Boolean(item.hasDamage || hit.isDamage || hit.formula?.trim());
    const hasMissDamage = Boolean(miss.halfDamage || miss.formula?.trim());
    Logger.info("[DEBUG-pd-damage] Prepared power damage data", {
      itemId: item.id ?? item._id,
      hasDamage,
      hasMissDamage,
      hitText: hit.detail,
      missText: miss.detail,
      hitFormula: hit.formula,
      missFormula: miss.formula,
    });
    ChatMessage.create({
      flavor: `<b>${attacker.name}</b> uses <b>${item.name}</b> VS. <b>${attack.def?.toUpperCase() ?? "?"}</b>!`,
      content: PlayerDefense.#buildDefenseChatContent(targets),
      flags: {
        playerDefense: {
          attackName: item.name,
          attackerId: attacker.id,
          attackerTokenId: attackContext.attackerTokenId,
          sceneId: attackContext.sceneId,
          itemId: item.id ?? item._id,
          itemName: item.name,
          attackRange: typeof item.rangeType === "string" ? item.rangeType : typeof system.rangeType === "string" ? system.rangeType : typeof attack.range === "string" ? attack.range : attack.range?.value ?? null,
          hasDamage,
          hasMissDamage,
          missDamage: {
            halfDamage: Boolean(miss.halfDamage),
            formula: miss.formula ?? "",
          },
          damageRolled: { normal: false, critical: false, miss: false },
          targets,
        },
      },
    });
  }

    /**
     * @param {number} diceResult
     * @param {number} totalResult
     * @param {number} rollDC
     * @returns {{outcome: string, resultHtml: string}}
     */
  static #getDefenseResult(diceResult, totalResult, rollDC) {
    if (diceResult === PlayerDefense.CRITICAL_FAILURE) {
      return { outcome: "critical", resultHtml: `<b><a style='color: darkred'>The enemy critically hit! (DC ${rollDC})</a></b>` };
    }

    if (totalResult < rollDC) {
      return { outcome: "normal", resultHtml: `<b><a style='color: red'>The enemy hit! (DC ${rollDC})</a></b>` };
    }

    if (diceResult === PlayerDefense.CRITICAL_SUCCESS) {
      return { outcome: "miss", resultHtml: `<b><a style='color: darkgreen'>The enemy critically missed! (DC ${rollDC})</a></b>` };
    }

    return { outcome: "miss", resultHtml: `<b><a style='color: green'>The enemy missed! (DC ${rollDC})</a></b>` };
  }

    /**
     * Formats the power's effect text for a resolved defense outcome.
     *
     * @param {object} target
     * @param {string} outcome
     * @returns {string}
     */
  static #getOutcomeEffectHtml(target, outcome) {
    const isMiss = outcome === "miss";
    const text = isMiss ? target.missText : target.hitText;
    if (!text) {
      return "";
    }

    const label = isMiss ? "MISS" : "HIT";
    const cssClass = isMiss ? "player-defense-effect--miss" : "player-defense-effect--hit";
    return `<div class="player-defense-effect ${cssClass}"><strong>${label}</strong><div>${text}</div></div>`;
  }

    /**
     * Foundry's preCreateChatMessage hook; replaces a captured NPC attack roll.
     *
     * @param {ChatMessage} message
     * @returns {boolean|undefined}
     */
  static OnPowerChatMessage(message) {
    const attack = game.PlayerDefense.lastAttack;
    if (attack === null || !PlayerDefense.#isMatchingAttackMessage(message, attack)) {
      return true;
    }

    const rollFormula = message.rolls[0].formula;
    const { rollModifiers, totalModifier } = PlayerDefense.#getAttackRollData(rollFormula);
    if (rollModifiers.length === 0) {
      Logger.warn("Attack roll contains no modifiers", { messageId: message.id, rollFormula });
    }


    if (Number.isNaN(totalModifier)) {
      Logger.error("Attack modifier is not a number; aborting", { messageId: message.id, rollFormula, rollModifiers, totalModifier });
      return;
    }

    const rollDC = PlayerDefense.#getDefenseDC(totalModifier);
    const { targets, item, attacker } = attack;
    game.PlayerDefense.lastAttack = null;
    game.TriggerPrompts?.clearPendingAttackContext();
    const { attack: attackData } = PlayerDefense.#getPowerDamageData(item);
    const defenseTargets = PlayerDefense.#buildDefenseTargets(targets, rollDC, totalModifier, attacker, attackData.def?.toUpperCase() ?? "?", item);
    Logger.info("Intercepting NPC attack", { messageId: message.id, attackerId: attacker.id, itemId: item.id, targetIds: defenseTargets.map(target => target.actorId), rollFormula, totalModifier, rollDC });
    PlayerDefense.#createDefenseMessage(attacker, item, defenseTargets, attack);
    return false;
  }

    /**
     * Captures NPC attack context from the DnD4e rollAttack hook.
     *
     * @param {Item} item
     * @param {object} target
     * @param {object} speaker
     */
  static OnRollAttack(item, target, speaker) {
    const attacker = game.actors.find(x => x.id === speaker.actor);
    if (attacker?.type !== "NPC") {
      return;
    }

    const attackerCombatant = game.combat?.combatants.find(combatant => combatant.actorId === attacker.id);

    const itemId = item.id ?? item._id;
    const targetsData = target.targets
      .map((token, index) => ({ token, defenseMod: target.targDefValArray[index] - 10 }))
      .filter(targetData => targetData.token.actor?.type === "Player Character");
    if (targetsData.length === 0) {
      game.PlayerDefense.lastAttack = null;
      return;
    }

    game.PlayerDefense.lastAttack = {
      item,
      targets: targetsData,
      attacker,
      attackerTokenId: attackerCombatant?.tokenId ?? speaker.token ?? null,
      sceneId: attackerCombatant?.sceneId ?? canvas.scene?.id ?? null,
    };
    Logger.info("Captured NPC attack", { attackerId: attacker.id, itemId, targetIds: targetsData.map(targetData => targetData.token.actor.id), defenseModifiers: targetsData.map(targetData => targetData.defenseMod) });
  }

    /**
     * Foundry's renderChatMessageHTML hook; makes the assigned client's single dialog attempt.
     *
     * @param {ChatMessage} message
     * @param {object} socket
     */
  static onRenderDefenseMessage(message, socket) {
    const defense = message.flags?.playerDefense;
    if (!defense?.targets || !socket) {
      return;
    }

    defense.targets
      .filter(target => !target.dialogAttempted && target.assignedUserId === game.user.id)
      .forEach(target => PlayerDefense.#tryShowDefenseDialog(message, target, socket));
  }

    /**
     * Records the one permitted dialog attempt through the GM before rendering it.
     *
     * @param {ChatMessage} message
     * @param {object} target
     * @param {object} socket
     */
  static async #tryShowDefenseDialog(message, target, socket) {
    try {
      const attempted = await socket.executeAsGM("attemptDefenseDialog", message.id, target.id);
      if (attempted) {
        PlayerDefense.#showDefenseDialog(message, target, socket);
      }
    } catch (error) {
      Logger.error("Failed to request or render defense dialog", { messageId: message.id, targetId: target.id, error: error.message });
    }
  }

    /**
     * Renders the defender's modal dialog.
     *
     * @param {ChatMessage} message
     * @param {object} target
     * @param {object} socket
     */
  static #showDefenseDialog(message, target, socket) {
    const dialog = createDefenseDialogPayload({ attackName: message.flags.playerDefense.attackName, ...target });
    new foundry.applications.api.DialogV2({
      window: { title: dialog.title },
      content: dialog.content,
      classes: ["player-defense-dialog-window"],
      position: { width: 450 },
      buttons: [{
        action: "defend",
        label: dialog.defendLabel,
        default: true,
        callback: () => PlayerDefense.#defend(message, target, socket),
      }],
    }).render({ force: true });
  }

    /**
     * Rolls the defense for the assigned user and asks a GM to update the chat message.
     *
     * @param {ChatMessage} message
     * @param {object} target
     * @param {object} socket
     */
  static async #defend(message, target, socket) {
    const actor = game.actors.get(target.actorId);
    if (target.assignedUserId !== game.user.id || (!game.user.isGM && !actor?.testUserPermission(game.user, "OWNER"))) {
      return;
    }

    const defenseRoll = new Roll(`1d20 + ${target.defenseMod}`);
    defenseRoll.propagateFlavor(`DC ${target.rollDC}`);
    const roll = await defenseRoll.evaluate();
    const diceResult = roll.terms[0].total;
    const totalResult = roll.total;
    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }

    const { outcome, resultHtml } = PlayerDefense.#getDefenseResult(diceResult, totalResult, target.rollDC);
    const effectHtml = PlayerDefense.#getOutcomeEffectHtml(target, outcome);
    const rollHtml = `<pg>${await roll.render()}</pg>`;
    
    Logger.info("Resolved defense roll", { messageId: message.id, actorId: target.actorId, targetId: target.id, defenseMod: target.defenseMod, rollDC: target.rollDC, diceResult, totalResult, outcome });
    await socket.executeAsGM("resolveDefenseTarget", message.id, target.id, outcome, resultHtml + rollHtml + effectHtml);
  }
}
