import { SocketHelper } from "./socket-helper.js";
import { Logger } from "../../shared/logger.js";
import { createDefenseDialogPayload, createGroupedDefenseDialogPayload } from "./player-defense-workflow.js";
import { PlayerDefenseEffects } from "./player-defense-effects.js";
import { renderDefenseTarget, renderManagedDefenseContent, renderManagedDefenseMessage } from "./player-defense-chat.js";

/**
 * Handles NPC attack interception and the player-defense dialog workflow.
 */
export class PlayerDefense {
  static BASE_DEFENSE = 10;
  static REVERSED_ROLL_OFFSET = 2;
  static CRITICAL_FAILURE = 1;
  static CRITICAL_SUCCESS = 20;
  lastAttack = { item: "", targets: [], attacker: null };
  static #groupedDialogs = new Set();

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
     * Reads the numeric attack bonus separately from dice selection. Only
     * selections retaining one d20 can be reversed into a defense check.
     *
     * @returns {{rollModifiers: number[], totalModifier: number, defenseDice: string}}
     */
  static #getAttackRollData(rollFormula) {
    const compactFormula = rollFormula.replace(/\s+/g, "");
    const rollModifiers = compactFormula.replace(/\d*d\d+(?:[a-z]+\d*)*/gi, "").match(/[-+]?\d+/g)?.map(Number) || [];
    const attackDie = compactFormula.match(/\b(\d*)d20(kh|kl|dh|dl|k|d)(\d*)(?![a-z\d])/i);
    let defenseDice = "1d20";
    if (attackDie) {
      const number = Number(attackDie[1] || 1);
      const selection = attackDie[2].toLowerCase();
      const count = Number(attackDie[3] || 1);
      const keepsOne = selection.startsWith("k") ? count === 1 : number - count === 1;
      if (number > 1 && keepsOne) {
        const attackKeepsHighest = ["k", "kh", "d", "dl"].includes(selection);
        defenseDice = `${number}d20${attackKeepsHighest ? "kl" : "kh"}1`;
      }
    }
    return { rollModifiers, totalModifier: rollModifiers.reduce((sum, num) => sum + num, 0), defenseDice };
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
     * @param {string} defenseDice Reversed d20 selection, persisted for the defending client.
     * @returns {object[]}
     */
    static #buildDefenseTargets(targets, rollDC, attackModifier, attacker, defenseStat, item, defenseDice) {
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
                defenseDice,
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
     * @param {object} attackContext Captured NPC attack and deferred effect state.
     * @param {ChatMessage|null} message Native automation message to modify before creation.
     * @returns {boolean} Whether to retain the native message.
     */
  static #createDefenseMessage(attacker, item, targets, attackContext, message = null) {
    const { attack, hit, miss } = PlayerDefense.#getPowerDamageData(item);
    const system = item.system ?? item.data?.data ?? {};
    const hasDamage = Boolean(item.hasDamage || hit.isDamage || hit.formula?.trim());
    const hasMissDamage = Boolean(miss.halfDamage || miss.formula?.trim());
    const data = {
      flavor: `<b>${attacker.name}</b> uses <b>${item.name}</b> VS. <b>${attack.def?.toUpperCase() ?? "?"}</b>!`,
      content: targets.map(target => renderDefenseTarget(target, item.name)).join(""),
      flags: {
        playerDefense: {
          ...attackContext.deferredEffects,
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
    };
    if (message?.flags?.["dnd4e-health-display"]?.attackResults?.effectsManaged) {
      // Keep the native session message and its NPC rolls; PC verdicts arrive later.
      const ids = new Set(targets.map(target => target.tokenId));
      data.flags = { ...message.flags, ...data.flags };
      data.flags.playerDefense.automationManaged = true;
      data.rolls = message.rolls.filter(roll => !ids.has(roll.options?.multirollData?.targetID));
      if (data.rolls.length === 0) {
        // The native roll message carries dice audio even after its rolls are removed.
        data.sound = null;
      }
      data.flags.playerDefense.nativeResults = data.rolls.map(roll => {
        const attack = roll.options.multirollData;
        const outcome = ["critical", "fumble", "immune"].includes(attack.critstate) ? attack.critstate : attack.hitstate;
        return { tokenId: attack.targetID, name: attackContext.nativeTargetNames?.[attack.targetID] ?? "Target",
          total: roll.total, label: { hit: "HIT", miss: "MISS", critical: "CRIT", fumble: "CRIT FAIL", immune: "IMMUNE" }[outcome] ?? "ATTACK" };
      });
      data.content = renderManagedDefenseContent(data.flags.playerDefense, data.flags["dnd4e-health-display"].attackResults.targetIds);
      message.updateSource(data);
      return true;
    }
    ChatMessage.create(data);
    return false;
  }

    /**
     * @param {number} diceResult
     * @param {number} totalResult
     * @param {number} rollDC
     * @returns {{outcome: string}}
     */
  static #getDefenseResult(diceResult, totalResult, rollDC) {
    if (diceResult === PlayerDefense.CRITICAL_FAILURE) {
      return { outcome: "critical" };
    }

    if (diceResult === PlayerDefense.CRITICAL_SUCCESS) {
      return { outcome: "miss" };
    }

    if (totalResult < rollDC) {
      return { outcome: "normal" };
    }

    return { outcome: "miss" };
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
    const { rollModifiers, totalModifier, defenseDice } = PlayerDefense.#getAttackRollData(rollFormula);
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
    let defenseTargets = PlayerDefense.#buildDefenseTargets(targets, rollDC, totalModifier, attacker, attackData.def?.toUpperCase() ?? "?", item, defenseDice);
    Logger.info("Intercepting NPC attack", { messageId: message.id, attackerId: attacker.id, itemId: item.id, targetIds: defenseTargets.map(target => target.actorId), rollFormula, totalModifier, rollDC });
    const managed = message.flags?.["dnd4e-health-display"]?.attackResults?.effectsManaged;
    if (managed) {
      defenseTargets = defenseTargets.filter(target => message.rolls.find(roll =>
        roll.options?.multirollData?.targetID === target.tokenId)?.options.multirollData.critstate !== "immune");
      for (const target of defenseTargets) {
        const roll = message.rolls.find(entry => entry.options?.multirollData?.targetID === target.tokenId);
        if (!roll) {
          Logger.error("Missing per-target attack roll for active defense", { tokenId: target.tokenId });
          return false;
        }
        const data = PlayerDefense.#getAttackRollData(roll.formula);
        target.attackModifier = data.totalModifier;
        target.rollDC = PlayerDefense.#getDefenseDC(data.totalModifier);
        target.defenseDice = data.defenseDice;
      }
    }
    return PlayerDefense.#createDefenseMessage(attacker, item, defenseTargets, attack, managed ? message : null);
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

    // Several unlinked creatures can share one actor id, so match the exact attacking token first.
    const attackerCombatant = (speaker.token ? game.combat?.combatants.find(combatant => combatant.tokenId === speaker.token) : null)
      ?? game.combat?.combatants.find(combatant => combatant.actorId === attacker.id);

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
      nativeTargetNames: Object.fromEntries(target.targets.map(token => [token.id, token.name ?? token.actor?.name])),
      deferredEffects: PlayerDefenseEffects.deferAttackEffects(target, targetsData.map(entry => entry.token)),
      attackerTokenId: attackerCombatant?.tokenId ?? speaker.token ?? null,
      sceneId: attackerCombatant?.sceneId ?? canvas.scene?.id ?? null,
    };
    Logger.info("Captured NPC attack", { attackerId: attacker.id, itemId, targetIds: targetsData.map(targetData => targetData.token.actor.id), defenseModifiers: targetsData.map(targetData => targetData.defenseMod) });
  }

  /**
   * Render remaining managed targets after automation changes its target roster.
   * @param {ChatMessage} message Session message; does not mutate documents.
   * @param {string[]} targetIds Remaining scene-token IDs.
   * @returns {string}
   */
  renderManagedMessage(message, targetIds) {
    return renderManagedDefenseMessage(message, targetIds);
  }

  /**
   * Recalculate a managed defense total without rerolling its die.
   * @param {ChatMessage} message GM-owned pending session message.
   * @param {string} tokenId Defender's scene-token ID.
   * @param {number} modifier Flat adjustment to the player defense total.
   * @returns {Promise<void>}
   */
  async adjustDefenseTarget(message, tokenId, modifier) {
    return SocketHelper.adjustDefenseTarget(message.id, tokenId, modifier);
  }

    /**
     * Foundry's renderChatMessageHTML hook; makes the assigned client's single dialog attempt.
     *
     * @param {ChatMessage} message
     * @param {object} socket
     */
  static onRenderDefenseMessage(message, socket, html = null) {
    const defense = message.flags?.playerDefense;
    // A multi-attack's defenders get one dialog for all the attacks on them, once every attack exists.
    // Any attack of the group can complete it, including one with no player-character targets.
    const group = socket ? PlayerDefense.#getAttackGroup(message) : null;
    if (group?.complete) {
      PlayerDefense.#showGroupedDefenseDialogs(group, socket);
    }

    if (!defense?.targets || !socket) {
      return;
    }
    if (defense.automationManaged && message.isContentVisible !== false
        && !game.settings.get("banter-4e-modifications", "enable-compact-chat-rolls")) {
      const root = html?.[0] ?? html;
      const content = root?.querySelector?.(".message-content");
      if (content) {
        // Foundry renders native NPC rolls in mixed messages; restore the complete session card.
        content.innerHTML = renderManagedDefenseMessage(message,
          message.flags["dnd4e-health-display"].attackResults.targetIds);
        root.classList.add("banter-defense-message");
      }
    }

    if (group) {
      // A multi-attack's targets are handled together above, not one message at a time.
      return;
    }

    defense.targets
      .filter(target => !target.dialogAttempted && target.assignedUserId === game.user.id)
      .forEach(target => PlayerDefense.#tryShowDefenseDialog(message, target, socket));
  }

    /**
     * Finds the attack messages of a multi-attack (several creatures using one power together).
     * Single attacks, and ordinary NPC attacks, return null and keep their one-dialog-per-target flow.
     *
     * @param {ChatMessage} message
     * @returns {{sessionId: string, messages: ChatMessage[], complete: boolean}|null}
     */
  static #getAttackGroup(message) {
    const context = message.flags?.["dnd4e-health-display"]?.attackResults;
    if (!(context?.groupSize > 1) || !context.sessionId) {
      return null;
    }

    const messages = Array.from(game.messages?.contents ?? game.messages ?? [])
      .filter(entry => entry.flags?.["dnd4e-health-display"]?.attackResults?.sessionId === context.sessionId);
    if (!messages.some(entry => entry.id === message.id)) {
      messages.push(message);
    }

    return { sessionId: context.sessionId, messages, complete: messages.length >= context.groupSize };
  }

    /**
     * Opens one dialog per defending token covering every attack on it from this group.
     *
     * @param {{sessionId: string, messages: ChatMessage[]}} group
     * @param {object} socket
     */
  static #showGroupedDefenseDialogs(group, socket) {
    const byToken = new Map();
    for (const message of group.messages) {
      for (const target of message.flags?.playerDefense?.targets ?? []) {
        if (!target.dialogAttempted && target.assignedUserId === game.user.id) {
          byToken.set(target.tokenId, [...(byToken.get(target.tokenId) ?? []), { message, target }]);
        }
      }
    }

    for (const [tokenId, entries] of byToken) {
      const key = `${group.sessionId}:${tokenId}`;
      if (PlayerDefense.#groupedDialogs.has(key)) {
        continue;
      }

      PlayerDefense.#groupedDialogs.add(key);
      PlayerDefense.#tryShowGroupedDefenseDialog(entries, socket).finally(() => PlayerDefense.#groupedDialogs.delete(key));
    }
  }

    /**
     * Claims every attack's one dialog attempt through the GM, then shows them together.
     *
     * @param {Array<{message: ChatMessage, target: object}>} entries
     * @param {object} socket
     * @returns {Promise<void>}
     */
  static async #tryShowGroupedDefenseDialog(entries, socket) {
    try {
      const claimed = [];
      for (const entry of entries) {
        if (await socket.executeAsGM("attemptDefenseDialog", entry.message.id, entry.target.id)) {
          claimed.push(entry);
        }
      }

      if (claimed.length) {
        PlayerDefense.#showGroupedDefenseDialog(claimed, socket);
      }
    } catch (error) {
      Logger.error("Failed to request or render grouped defense dialog", { tokenId: entries[0]?.target.tokenId, error: error.message });
    }
  }

    /**
     * Renders one modal for all attacks on a defender; each attack still gets its own defense roll.
     *
     * @param {Array<{message: ChatMessage, target: object}>} entries
     * @param {object} socket
     */
  static #showGroupedDefenseDialog(entries, socket) {
    const dialog = createGroupedDefenseDialogPayload(entries.map(({ message, target }) =>
      ({ attackName: message.flags.playerDefense.attackName, ...target })));
    new foundry.applications.api.DialogV2({
      window: { title: dialog.title },
      content: dialog.content,
      classes: ["player-defense-dialog-window"],
      position: { width: 450 },
      buttons: [{
        action: "defend",
        label: dialog.defendLabel,
        default: true,
        callback: () => Promise.all(entries.map(({ message, target }) => PlayerDefense.#defend(message, target, socket))),
      }],
    }).render({ force: true });
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

    const defenseRoll = new Roll(`${target.defenseDice ?? "1d20"} + ${target.defenseMod}`);
    defenseRoll.propagateFlavor(`DC ${target.rollDC}`);
    const roll = await defenseRoll.evaluate();
    const diceResult = roll.terms[0].total;
    const totalResult = roll.total;
    const managed = message.flags.playerDefense.automationManaged;
    if (managed) {
      // Appending this evaluated roll to the session message lets DSN synchronize every client.
      roll.options.banterDefenseTarget = target.tokenId;
    } else if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }

    const { outcome } = PlayerDefense.#getDefenseResult(diceResult, totalResult, target.rollDC);
    const resultCard = renderDefenseTarget(target, message.flags.playerDefense.attackName, {
      outcome, total: totalResult, natural: diceResult, rollHtml: await roll.render(),
    });
    
    Logger.info("Resolved defense roll", { messageId: message.id, actorId: target.actorId, targetId: target.id, defenseMod: target.defenseMod, rollDC: target.rollDC, diceResult, totalResult, outcome });
    await socket.executeAsGM("resolveDefenseTarget", message.id, target.id, outcome, resultCard, { total: totalResult, natural: diceResult, rollHtml: await roll.render(),
      ...(managed ? { roll: JSON.stringify(roll.toJSON()) } : {}),
    });
  }
}
