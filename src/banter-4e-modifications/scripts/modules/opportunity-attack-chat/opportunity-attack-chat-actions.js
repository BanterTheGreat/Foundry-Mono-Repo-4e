/**
 * Adds alternate-roll actions to eligible DnD4e power chat cards.
 *
 * The DnD4e system owns the normal chat-card actions. This adapter adds only
 * the alternate-roll action and delegates the roll back to Actor#usePower so
 * limited uses, dialogs, and the system's roll variance stay authoritative.
 */
export class OpportunityAttackChatActions {
  static BUTTON_SELECTOR = "[data-banter-roll-variant]";
  static VARIANT = Object.freeze({ REGULAR: "regular", CHARGE: "charge", OPPORTUNITY: "opportunity" });

  /**
   * Adds the next available alternate-roll button to one rendered power card.
   *
   * @param {ChatMessage} message
   * @param {HTMLElement|object} html
   *   Native rendered HTML in Foundry v13+, or the legacy jQuery wrapper in
   *   Foundry v12.
   * @returns {void}
   */
  static onRenderChatMessage(message, html) {
    const root = globalThis.HTMLElement && html instanceof globalThis.HTMLElement ? html : html?.[0] ?? html;
    const card = root?.querySelector?.(".dnd4e.chat-card.item-card");
    const actor = OpportunityAttackChatActions.#findCardActor(card);
    const item = actor?.items?.get(card?.dataset.itemId);
    const nextVariant = OpportunityAttackChatActions.findNextVariant(message, actor, item);
    if (!card || !nextVariant) {
      return;
    }

    const buttons = card.querySelector(".card-buttons");
    if (!buttons || buttons.querySelector(OpportunityAttackChatActions.BUTTON_SELECTOR)) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.banterRollVariant = nextVariant;
    button.innerHTML = OpportunityAttackChatActions.#renderVariantButton(nextVariant);
    button.addEventListener("click", event => OpportunityAttackChatActions.#onVariantClick(event, message, actor, item, nextVariant));
    buttons.append(button);
  }

  /**
   * Identifies a power that DnD4e can roll as an Opportunity Attack.
   *
   * DnD4e 0.9.3 stores its native alternate mode in `attack.canOpp`. Imported
   * power data may instead expose roll modes as an array or keyed object.
   * NPC Basic Attacks are a legacy DnD4e opportunity-attack convention.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @returns {boolean}
   */
  static isEligiblePower(actor, item) {
    if (item?.type !== "power") {
      return false;
    }
    const system = item.system ?? item.data?.data ?? {};
    const attack = item.attack ?? system.attack ?? {};
    return OpportunityAttackChatActions.#canUseOpportunityAttack(actor, item);
  }

  /**
   * Selects the next roll mode for the card's current variant.
   *
   * A regular card prefers Charge, then Opportunity Attack. A Charge card
   * advances to Opportunity Attack when available, otherwise returns to
   * regular. An Opportunity Attack card always returns to regular.
   *
   * @param {ChatMessage} message
   * @param {Actor} actor
   * @param {Item} item
   * @returns {"regular"|"charge"|"opportunity"|null}
   */
  static findNextVariant(message, actor, item) {
    if (item?.type !== "power") {
      return null;
    }
    const currentVariant = OpportunityAttackChatActions.#findCurrentVariant(message);
    if (currentVariant === OpportunityAttackChatActions.VARIANT.OPPORTUNITY) {
      return OpportunityAttackChatActions.VARIANT.REGULAR;
    }
    if (currentVariant === OpportunityAttackChatActions.VARIANT.CHARGE) {
      return OpportunityAttackChatActions.#canUseOpportunityAttack(actor, item)
        ? OpportunityAttackChatActions.VARIANT.OPPORTUNITY
        : OpportunityAttackChatActions.VARIANT.REGULAR;
    }
    if (OpportunityAttackChatActions.#canUseCharge(item)) {
      return OpportunityAttackChatActions.VARIANT.CHARGE;
    }
    return OpportunityAttackChatActions.#canUseOpportunityAttack(actor, item)
      ? OpportunityAttackChatActions.VARIANT.OPPORTUNITY
      : null;
  }

  /**
   * Determines whether the current user has the same authority as DnD4e's
   * built-in power-card actions: a GM or the message author.
   *
   * @param {ChatMessage} message
   * @param {User} user
   * @returns {boolean}
   */
  static canUsePowerFromMessage(message, user) {
    return user?.isGM === true || message?.isAuthor === true;
  }

  /**
   * Rolls the supplied power through DnD4e's requested variant and deletes
   * the source chat card after the new variant card has been created.
   *
   * @param {ChatMessage} message
   * @param {Actor} actor
   * @param {Item} item
   * @param {"regular"|"charge"|"opportunity"} variant
   * @param {User} [user=game.user]
   * @returns {Promise<boolean>}
   *   Whether a roll was started.
   */
  static async rollChatCardVariant(message, actor, item, variant, user = game.user) {
    if (!OpportunityAttackChatActions.canUsePowerFromMessage(message, user)
      || !OpportunityAttackChatActions.#canRollVariant(actor, item, variant)
      || !actor?.usePower) {
      return false;
    }
    await actor.usePower(item, { configureDialog: true, variance: OpportunityAttackChatActions.#varianceFor(variant) });
    await message.delete?.();
    return true;
  }

  /**
   * Compatibility entry point for consumers that invoke an Opportunity Attack
   * directly rather than through a rendered chat-card action.
   *
   * @param {ChatMessage} message
   * @param {Actor} actor
   * @param {Item} item
   * @returns {Promise<boolean>}
   */
  static async rollOpportunityAttack(message, actor, item) {
    return OpportunityAttackChatActions.rollChatCardVariant(message, actor, item, OpportunityAttackChatActions.VARIANT.OPPORTUNITY);
  }

  /**
   * Resolves the actor that owns a DnD4e chat card.
   *
   * @param {HTMLElement} card
   * @returns {Actor|null}
   */
  static #findCardActor(card) {
    if (!card) {
      return null;
    }
    const tokenReference = card.dataset.tokenId;
    if (tokenReference) {
      const [, sceneId,, tokenId] = tokenReference.split(".");
      const token = game.scenes?.get(sceneId)?.getEmbeddedDocument?.("Token", tokenId);
      return token?.actor ?? null;
    }
    return game.actors?.get(card.dataset.actorId) ?? null;
  }

  /**
   * Checks array and keyed-object roll-mode data for a named variant.
   *
   * @param {object[]|object|undefined} rollModes
   * @param {string} property
   * @returns {boolean}
   */
  static #hasRollMode(rollModes, property) {
    const modes = Array.isArray(rollModes) ? rollModes : Object.values(rollModes ?? {});
    return modes.some(mode => mode?.[property] === true);
  }

  /**
   * Determines whether the DnD4e power may use its Charge roll mode.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  static #canUseCharge(item) {
    const system = item.system ?? item.data?.data ?? {};
    const attack = item.attack ?? system.attack ?? {};
    return attack.canCharge === true
      || OpportunityAttackChatActions.#hasRollMode(system.rollModes, "charge")
      || OpportunityAttackChatActions.#hasRollMode(system.rollModes, "chargeAttack");
  }

  /**
   * Determines whether the DnD4e power may use its Opportunity Attack mode.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @returns {boolean}
   */
  static #canUseOpportunityAttack(actor, item) {
    const system = item.system ?? item.data?.data ?? {};
    const attack = item.attack ?? system.attack ?? {};
    return attack.canOpp === true
      || OpportunityAttackChatActions.#hasRollMode(system.rollModes, "opportunityAttack")
      || (actor?.type === "NPC" && attack.isBasic === true);
  }

  /**
   * Reads DnD4e's persisted chat-roll variance.
   *
   * @param {ChatMessage} message
   * @returns {"regular"|"charge"|"opportunity"}
   */
  static #findCurrentVariant(message) {
    const variance = message.flags?.dnd4e?.variance ?? {};
    if (variance.isOpp === true) {
      return OpportunityAttackChatActions.VARIANT.OPPORTUNITY;
    }
    if (variance.isCharge === true) {
      return OpportunityAttackChatActions.VARIANT.CHARGE;
    }
    return OpportunityAttackChatActions.VARIANT.REGULAR;
  }

  /**
   * Determines whether an eligible actor power can switch to the requested mode.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @param {"regular"|"charge"|"opportunity"} variant
   * @returns {boolean}
   */
  static #canRollVariant(actor, item, variant) {
    if (item?.type !== "power") {
      return false;
    }
    if (variant === OpportunityAttackChatActions.VARIANT.REGULAR) {
      return true;
    }
    if (variant === OpportunityAttackChatActions.VARIANT.CHARGE) {
      return OpportunityAttackChatActions.#canUseCharge(item);
    }
    return OpportunityAttackChatActions.#canUseOpportunityAttack(actor, item);
  }

  /**
   * Converts a chat-card variant to DnD4e's roll-variance format.
   *
   * @param {"regular"|"charge"|"opportunity"} variant
   * @returns {object}
   */
  static #varianceFor(variant) {
    if (variant === OpportunityAttackChatActions.VARIANT.CHARGE) {
      return { isCharge: true };
    }
    if (variant === OpportunityAttackChatActions.VARIANT.OPPORTUNITY) {
      return { isOpp: true };
    }
    return {};
  }

  /**
   * Creates the visual label for one variant-switching button.
   *
   * @param {"regular"|"charge"|"opportunity"} variant
   * @returns {string}
   */
  static #renderVariantButton(variant) {
    if (variant === OpportunityAttackChatActions.VARIANT.CHARGE) {
      return `<i class="fas fa-person-running"></i> Charge`;
    }
    if (variant === OpportunityAttackChatActions.VARIANT.OPPORTUNITY) {
      return `<i class="fas fa-triangle-exclamation"></i> Opportunity Attack`;
    }
    return `<i class="fas fa-rotate-left"></i> Regular Attack`;
  }

  /**
   * Starts the selected variant roll and keeps the button usable on error.
   *
   * @param {MouseEvent} event
   * @param {ChatMessage} message
   * @param {Actor} actor
   * @param {Item} item
   * @param {"regular"|"charge"|"opportunity"} variant
   * @returns {Promise<void>}
   */
  static async #onVariantClick(event, message, actor, item, variant) {
    event.preventDefault();
    if (!OpportunityAttackChatActions.canUsePowerFromMessage(message, game.user)) {
      ui.notifications.warn("Only the message author or a GM can switch this power's roll variant.");
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await OpportunityAttackChatActions.rollChatCardVariant(message, actor, item, variant);
    } finally {
      button.disabled = false;
    }
  }
}
