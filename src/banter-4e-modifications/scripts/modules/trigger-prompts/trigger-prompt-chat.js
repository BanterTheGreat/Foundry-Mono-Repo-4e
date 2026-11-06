import { Logger } from "../../shared/logger.js";
import { TriggerPromptAlerts } from "./trigger-prompt-alerts.js";
import { TriggerItemLimits } from "./trigger-item-limits.js";
import { ItemTriggerAssignments } from "./item-trigger-assignments.js";
import { TRIGGER_ID, TRIGGER_PROMPT_ACTION, TRIGGER_PROMPT_FLAG, TRIGGER_PROMPT_TIMEOUT_MS, TRIGGER_PROMPT_UI, TRIGGER_SOCKET_ACTION } from "./constants.js";

/** Extra time a claim is honored after the deadline, to absorb network delay. */
const CLAIM_GRACE_MS = 1500;

/**
 * Creates recipient-only prompt cards and binds their client-side controls.
 *
 * The prompt message is created by the client that evaluated the event (its
 * author), and Foundry lets only the author or a GM modify it. Claiming and
 * dismissing therefore run on the author, reached through SocketLib, so no GM
 * has to be present. Every client enforces the stored `expiresAt` deadline
 * itself; the author's timer only tidies the chat log.
 */
export class TriggerPromptChat {
  #queue = Promise.resolve();

  /**
   * @param {object} socket
   *   Registered SocketLib module used to reach a prompt's author.
   */
  constructor(socket) {
    this.socket = socket;
    this.limits = new TriggerItemLimits(socket);
    this.alerts = new TriggerPromptAlerts((message, html) => this.bindPromptCard(message, html, false));
  }

  /**
   * Whether a prompt's response window has ended.
   *
   * @param {{expiresAt?: number|null}} prompt
   * @param {number} [graceMs=0]
   * @returns {boolean}
   */
  static isExpired(prompt, graceMs = 0) {
    return Number.isFinite(prompt?.expiresAt) && Date.now() >= prompt.expiresAt + graceMs;
  }

  /**
   * Creates a private prompt card for every eligible recipient.
   *
   * The message flag is the durable record of the available power choices and
   * its deadline; rendered HTML is only a client-side view of that state.
   *
   * @param {{trigger: object, actor: Actor, assignments: object[], context: object, recipientIds: string[]}} prompt
   *   Resolved prompt data prepared by the combat dispatcher.
   * @returns {Promise<void>}
   */
  async createPromptCard({ trigger, actor, assignments, context: promptContext, recipientIds }) {
    let opportunityTicket = null;
    const choices = [];
    const seen = new Set();
    for (const assignment of assignments.filter(candidate => candidate.item)) {
      if (seen.has(assignment.item.id)) {
        continue;
      }
      seen.add(assignment.item.id);
      const ticket = await this.limits.request(assignment.item, "offer", null, promptContext.combatId);
      if (ticket) {
        if (trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK && ItemTriggerAssignments.automatic(assignment.item)) {
          if (await this.limits.request(assignment.item, "claim", ticket)) {
            await this.#announceAutomaticBenefit({ trigger, actor, assignment, promptContext, recipientIds });
          }
        } else {
          choices.push({ ...assignment, limitTicket: ticket.unrestricted ? null : ticket });
        }
      }
    }
    if (assignments.some(assignment => assignment.item) && !choices.length) {
      return;
    }
    if (trigger.id === TRIGGER_ID.OPPORTUNITY_ATTACK) {
      if (!choices.length) {
        return;
      }
      opportunityTicket = await this.limits.request(choices[0].item, "opportunityOffer", { sourceKey: promptContext.sourceKey, combatId: promptContext.combatId });
      if (!opportunityTicket) {
        await this.#releaseChoices({ actorId: actor.id, actorUuid: actor.uuid, choices });
        return;
      }
    }
    // Connected player owners handle response prompts; otherwise keep GM recipients.
    const playerOwners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission?.(user, "OWNER"));
    if (playerOwners.length) {
      recipientIds = recipientIds.filter(id => playerOwners.some(user => user.id === id));
    }
    if (!recipientIds.length) {
      await this.#releaseChoices({ actorId: actor.id, actorUuid: actor.uuid, choices });
      return;
    }
    const buttons = choices
      .map(assignment => `<button data-trigger-prompt-action="${TRIGGER_PROMPT_ACTION.USE}" data-item-id="${assignment.item.id}">${foundry.utils.escapeHTML(assignment.item.name)}</button>`).join("");
    const expiresAt = Math.min(Date.now() + TRIGGER_PROMPT_TIMEOUT_MS,
      ...choices.filter(choice => choice.limitTicket).map(choice => choice.limitTicket.expiresAt));
    const message = await ChatMessage.create({
      whisper: recipientIds,
      flavor: `<b>${foundry.utils.escapeHTML(trigger.label)}</b>`,
      content: `<p>${foundry.utils.escapeHTML(promptContext.detail)}</p><div class="${TRIGGER_PROMPT_UI.PROMPT_ACTIONS_CLASS}">${buttons}<button data-trigger-prompt-action="${TRIGGER_PROMPT_ACTION.DISMISS}">${TRIGGER_PROMPT_UI.DISMISS_LABEL} (${TRIGGER_PROMPT_TIMEOUT_MS / 1000})</button></div>`,
      flags: {
        [TRIGGER_PROMPT_FLAG]: {
          triggerId: trigger.id,
          label: trigger.label,
          detail: promptContext.detail,
          actorId: actor.id,
          actorUuid: actor.uuid ?? null,
          ...(opportunityTicket ? { opportunityTicket } : {}),
          choices: choices.map(assignment => ({ assignmentId: assignment.id, itemId: assignment.item.id, ...(assignment.limitTicket ? { limitTicket: assignment.limitTicket } : {}) })),
          recipientIds,
          used: false,
          expiresAt,
        },
      },
    });
    setTimeout(() => this.expirePrompt(message.id)
      .catch(error => Logger.error("Failed to expire trigger prompt", { messageId: message.id, error: error.message })), TRIGGER_PROMPT_TIMEOUT_MS + CLAIM_GRACE_MS);
  }

  /** Post one durable public announcement with a recipient-only, short-lived alert. */
  async #announceAutomaticBenefit({ trigger, actor, assignment, promptContext, recipientIds }) {
    const escape = foundry.utils.escapeHTML;
    const item = assignment.item;
    // DnD4e 0.9.3 Item#toChat neither returns its message nor accepts flags.
    // Reuse its native rendering contract so the announcement can carry the
    // trigger's alert metadata without a second message or item activation.
    const rules = ["feat", "feature"].includes(item.type)
      ? (await foundry.applications.handlebars.renderTemplate("systems/dnd4e/templates/chat/item-card.hbs", {
        actor,
        tokenId: actor.token?.uuid ?? null,
        item,
        system: await item.getChatData(),
        labels: item.labels,
        hasAttack: item.hasAttack,
        isHealing: item.isHealing,
        isPower: false,
        hasDamage: item.hasDamage,
        hasHealing: item.hasHealing,
        hasEffect: item.hasEffect,
        cardData: null,
        hasSave: item.hasSave,
        hasAreaTarget: item.hasAreaTarget,
        isRoll: false,
      })).replace("ability-usage--", "ability-usage--other")
      : await TriggerPromptAlerts.powerDetails(item, actor);
    await ChatMessage.create({
      whisper: [],
      speaker: { actor: actor.id, alias: actor.name },
      flavor: `<b>Automatic benefit triggered: ${escape(assignment.item.name)}</b>`,
      content: `<p>${escape(actor.name)}: ${escape(promptContext.detail)}</p>${rules}`,
      flags: { core: { canPopout: true }, [TRIGGER_PROMPT_FLAG]: {
        automatic: true, triggerId: trigger.id, label: "Automatic benefit triggered",
        detail: promptContext.detail, actorId: actor.id, actorUuid: actor.uuid ?? null,
        choices: [{ itemId: assignment.item.id }], recipientIds, used: false,
        expiresAt: Date.now() + 6000,
      } },
    });
  }

  /**
   * Binds controls for a recipient of a prompt message. A client that is not a
   * recipient (the author of a prompt meant for others) hides the card.
   *
   * @param {ChatMessage} message
   * @param {HTMLElement} html
   * @param {boolean} [showAlert=true] Whether this is a chat render that also ensures its floating alert exists.
   */
  bindPromptCard(message, html, showAlert = true) {
    const prompt = message.flags?.[TRIGGER_PROMPT_FLAG];
    if (!prompt) {
      return;
    }
    if (prompt.automatic) {
      if (showAlert) {
        this.alerts.show(message);
      }
      return;
    }
    if (showAlert) {
      // The message is the shared claim record, not a second user-facing prompt.
      html.classList?.add(TRIGGER_PROMPT_UI.PROMPT_HIDDEN_CLASS);
      this.alerts.show(message);
    }
    if (!prompt.recipientIds?.includes(game.user.id)) {
      html.classList?.add(TRIGGER_PROMPT_UI.PROMPT_HIDDEN_CLASS);
      return;
    }
    if (prompt.used || TriggerPromptChat.isExpired(prompt)) {
      TriggerPromptChat.#removeControls(html);
      return;
    }
    if (showAlert) {
      this.#startExpiryCountdown(html, prompt.expiresAt);
    }
    html.querySelectorAll(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.USE}']`).forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      if (TriggerPromptChat.isExpired(prompt) || prompt.used) {
        return;
      }
      await this.#claimAndUsePower(message, event.currentTarget.dataset.itemId ?? prompt.itemId);
    }));
    html.querySelectorAll(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.DISMISS}']`).forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      const dismissed = await this.#executeOnAuthor(message, TRIGGER_SOCKET_ACTION.DISMISS_PROMPT, () => this.dismissPrompt(message.id));
      if (dismissed) {
        this.alerts.remove(message.id);
      }
    }));
  }

  /**
   * Marks a prompt used and returns its details. Runs on the prompt's author.
   *
   * Claims are serialized, so when two recipients answer at once exactly one
   * wins. A claim is refused after the deadline (less a short grace) or for an
   * item the prompt did not offer.
   *
   * @param {string} messageId
   * @param {string} itemId
   * @returns {Promise<object|null>}
   *   The prompt flag with the claimed `itemId`, or null when refused.
   */
  async claimPrompt(messageId, itemId) {
    return this.#serialize(async () => {
      const message = game.messages.get(messageId);
      const prompt = message?.flags?.[TRIGGER_PROMPT_FLAG];
      const allowedItemIds = prompt?.choices?.map(choice => choice.itemId) ?? [prompt?.itemId];
      if (!prompt || prompt.automatic || prompt.used || TriggerPromptChat.isExpired(prompt, CLAIM_GRACE_MS) || !allowedItemIds.includes(itemId)) {
        return null;
      }
      const ticket = prompt.choices?.find(choice => choice.itemId === itemId)?.limitTicket;
      if (prompt.opportunityTicket) {
        const actor = (prompt.actorUuid && globalThis.fromUuidSync?.(prompt.actorUuid)) || game.actors.get(prompt.actorId);
        const item = actor?.items.get(itemId);
        if (!item || !await this.limits.request(item, "opportunityClaim", { ...prompt.opportunityTicket, itemTicket: ticket })) {
          return null;
        }
      }
      if (ticket && !prompt.opportunityTicket) {
        const actor = (prompt.actorUuid && globalThis.fromUuidSync?.(prompt.actorUuid)) || game.actors.get(prompt.actorId);
        const item = actor?.items.get(itemId);
        if (!item || !await this.limits.request(item, "claim", ticket)) {
          return null;
        }
      }
      await message.update({ [`flags.${TRIGGER_PROMPT_FLAG}.used`]: true });
      await this.#releaseChoices(prompt);
      return { ...prompt, itemId };
    });
  }

  /**
   * Deletes a still-unclaimed prompt. Runs on the prompt's author.
   *
   * @param {string} messageId
   * @returns {Promise<boolean>}
   *   Whether an unclaimed prompt was deleted.
   */
  async dismissPrompt(messageId) {
    return this.#serialize(async () => {
      const message = game.messages.get(messageId);
      if (!message?.flags?.[TRIGGER_PROMPT_FLAG] || message.flags[TRIGGER_PROMPT_FLAG].automatic || message.flags[TRIGGER_PROMPT_FLAG].used) {
        return false;
      }
      await message.delete();
      await this.#releaseChoices(message.flags[TRIGGER_PROMPT_FLAG]);
      return true;
    });
  }

  /**
   * Deletes an unclaimed prompt whose deadline has passed. Sharing the claim
   * queue means a choice made at the deadline wins over cleanup.
   *
   * @param {string} messageId
   * @returns {Promise<boolean>}
   *   Whether an expired prompt was deleted.
   */
  async expirePrompt(messageId) {
    return this.#serialize(async () => {
      const message = game.messages.get(messageId);
      const prompt = message?.flags?.[TRIGGER_PROMPT_FLAG];
      if (!prompt || prompt.automatic || prompt.used || !TriggerPromptChat.isExpired(prompt, CLAIM_GRACE_MS)) {
        return false;
      }
      await message.delete();
      await this.#releaseChoices(prompt);
      return true;
    });
  }

  /** Release unused item reservations when their prompt is answered or removed. */
  async #releaseChoices(prompt) {
    const limited = prompt.choices?.filter(choice => choice.limitTicket) ?? [];
    if (!limited.length) {
      return;
    }
    const actor = (prompt.actorUuid && globalThis.fromUuidSync?.(prompt.actorUuid)) || game.actors.get(prompt.actorId);
    for (const choice of limited) {
      const item = actor?.items.get(choice.itemId);
      if (item) {
        await this.limits.request(item, "release", choice.limitTicket);
      }
    }
  }

  /**
   * Deletes unclaimed prompts that expired while their author was away. Each
   * client tidies its own prompts; a GM also tidies those whose author left.
   *
   * @returns {Promise<void>}
   */
  async sweepExpiredPrompts() {
    for (const message of Array.from(game.messages.values())) {
      const prompt = message.flags?.[TRIGGER_PROMPT_FLAG];
      const isOwnPrompt = message.author?.id === game.user.id;
      const isAbandoned = game.user.isGM && !message.author?.active;
      if (prompt && !prompt.used && (isOwnPrompt || isAbandoned)) {
        await this.expirePrompt(message.id).catch(error => Logger.error("Failed to sweep trigger prompt", { messageId: message.id, error: error.message }));
      }
    }
  }

  /**
   * Claims a prompt through its author, then starts the selected actor power.
   *
   * @param {ChatMessage} message
   * @param {string} itemId
   *   ID of one power offered by the message.
   * @returns {Promise<void>}
   */
  async #claimAndUsePower(message, itemId) {
    const prompt = await this.#executeOnAuthor(message, TRIGGER_SOCKET_ACTION.CLAIM_PROMPT, () => this.claimPrompt(message.id, itemId), itemId);
    if (!prompt) {
      return;
    }
    this.alerts.remove(message.id);
    const actor = (prompt.actorUuid && globalThis.fromUuidSync?.(prompt.actorUuid)) || game.actors.get(prompt.actorId);
    const item = actor?.items.get(prompt.itemId);
    if (["feat", "feature"].includes(item?.type)) {
      await item.toChat();
      return;
    }
    if (!item?.roll) {
      Logger.warn("Selected trigger prompt item cannot create a chat card", { messageId: message.id, actorId: prompt.actorId, itemId: prompt.itemId });
      return;
    }

    if (item.type === "power" && actor.usePower) {
      const activation = game.modules?.get("dnd4e-health-display")?.powerActivation;
      if (activation?.useAbility) {
        const tokens = actor.getActiveTokens?.() ?? [];
        const sourceToken = actor.token?.object ?? tokens.find(token => token.controlled) ?? tokens[0];
        if (await activation.useAbility(item, sourceToken)) {
          return;
        }
      }
      await actor.usePower(item, { configureDialog: true });
      return;
    }

    await item.roll({ configureDialog: false });
  }

  /**
   * Runs an operation on the user who keeps the prompt: its author while they
   * are connected, otherwise a GM. Runs locally when that is this client.
   *
   * @param {ChatMessage} message
   * @param {string} action
   *   SocketLib handler that performs the operation on the keeper.
   * @param {() => Promise<*>} runLocally
   *   The same operation for when this client is the keeper.
   * @param {...*} args
   *   Arguments after the message ID for the remote handler.
   * @returns {Promise<*>}
   *   The operation's result, or null when nobody can keep the prompt.
   */
  async #executeOnAuthor(message, action, runLocally, ...args) {
    const author = message.author?.active ? message.author : game.users.find(user => user.active && user.isGM);
    if (!author) {
      Logger.warn("No connected user can update this trigger prompt", { messageId: message.id });
      return null;
    }
    if (author.id === game.user.id) {
      return runLocally();
    }
    return this.socket.executeAsUser(action, author.id, message.id, ...args);
  }

  /**
   * Runs operations one after another so concurrent claims cannot interleave.
   *
   * @param {() => Promise<*>} operation
   * @returns {Promise<*>}
   */
  #serialize(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }

  /**
   * Displays the prompt's remaining response time in the Ignore button and
   * removes the controls when the time runs out.
   *
   * @param {HTMLElement} html
   *   Rendered chat-card element.
   * @param {number} expiresAt
   *   Epoch timestamp at which the prompt expires.
   */
  #startExpiryCountdown(html, expiresAt) {
    if (!Number.isFinite(expiresAt)) {
      return;
    }
    const dismiss = html.querySelector(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.DISMISS}']`);
    if (!dismiss) {
      return;
    }
    const update = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      dismiss.textContent = `${TRIGGER_PROMPT_UI.DISMISS_LABEL} (${seconds})`;
      return seconds;
    };
    if (update() === 0) {
      TriggerPromptChat.#removeControls(html);
      return;
    }
    const countdown = setInterval(() => {
      if (update() === 0) {
        clearInterval(countdown);
        TriggerPromptChat.#removeControls(html);
      }
    }, 250);
  }

  /**
   * Removes a card's buttons so an answered or expired prompt cannot be used.
   *
   * @param {HTMLElement} html
   */
  static #removeControls(html) {
    html.querySelectorAll("[data-trigger-prompt-action]").forEach(button => button.remove());
  }
}
