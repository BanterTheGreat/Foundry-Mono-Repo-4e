import { Logger } from "../../shared/logger.js";
import { TRIGGER_PROMPT_ACTION, TRIGGER_PROMPT_FLAG, TRIGGER_PROMPT_TIMEOUT_MS, TRIGGER_PROMPT_UI, TRIGGER_SOCKET_ACTION } from "./constants.js";

/**
 * Creates recipient-only prompt cards and binds their client-side controls.
 *
 * Chat-message mutation is delegated to SocketLib GM handlers so multiple
 * recipients cannot successfully claim the same prompt.
 */
export class TriggerPromptChat {
  /**
   * @param {object} socket
   *   Registered SocketLib module used for GM-authoritative operations.
   */
  constructor(socket) {
    this.socket = socket;
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
    const choices = assignments.filter(assignment => assignment.item)
      .map(assignment => `<button data-trigger-prompt-action="${TRIGGER_PROMPT_ACTION.USE}" data-item-id="${assignment.item.id}">${foundry.utils.escapeHTML(assignment.item.name)}</button>`).join("");
    const expiresAt = Date.now() + TRIGGER_PROMPT_TIMEOUT_MS;
    const message = await ChatMessage.create({
      whisper: recipientIds,
      flavor: `<b>${foundry.utils.escapeHTML(trigger.label)}</b>`,
      content: `<p>${foundry.utils.escapeHTML(promptContext.detail)}</p><div class="${TRIGGER_PROMPT_UI.PROMPT_ACTIONS_CLASS}">${choices}<button data-trigger-prompt-action="${TRIGGER_PROMPT_ACTION.DISMISS}">${TRIGGER_PROMPT_UI.DISMISS_LABEL} (10)</button></div>`,
      flags: { [TRIGGER_PROMPT_FLAG]: { triggerId: trigger.id, actorId: actor.id, choices: assignments.filter(assignment => assignment.item).map(assignment => ({ assignmentId: assignment.id, itemId: assignment.item.id })), recipientIds, used: false, expiresAt } },
    });
    setTimeout(() => this.socket.executeAsGM(TRIGGER_SOCKET_ACTION.EXPIRE_PROMPT, message.id)
      .catch(error => Logger.error("Failed to expire trigger prompt", { messageId: message.id, error: error.message })), TRIGGER_PROMPT_TIMEOUT_MS);
  }

  /**
   * Binds controls only for a recipient of an unclaimed prompt message.
   *
   * @param {ChatMessage} message
   * @param {HTMLElement} html
   */
  bindPromptCard(message, html) {
    const prompt = message.flags?.[TRIGGER_PROMPT_FLAG];
    if (!prompt?.recipientIds?.includes(game.user.id)) {
      return;
    }
    if (prompt.used) {
      html.querySelectorAll("[data-trigger-prompt-action]").forEach(button => button.remove());
      return;
    }
    this.#startExpiryCountdown(html, prompt.expiresAt);
    html.querySelectorAll(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.USE}']`).forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      await this.#claimAndUsePower(message, event.currentTarget.dataset.itemId ?? prompt.itemId);
    }));
    html.querySelectorAll(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.DISMISS}']`).forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      await this.socket.executeAsGM("deleteMessage", message.id);
    }));
  }

  /**
   * Claims a prompt through the GM, then starts the selected actor power.
   *
   * @param {ChatMessage} message
   * @param {string} itemId
   *   ID of one power offered by the message.
   * @returns {Promise<void>}
   */
  async #claimAndUsePower(message, itemId) {
    const prompt = await this.socket.executeAsGM(TRIGGER_SOCKET_ACTION.CLAIM_PROMPT, message.id, itemId);
    if (!prompt) {
      return;
    }
    const actor = game.actors.get(prompt.actorId);
    const item = actor?.items.get(prompt.itemId);
    if (!item?.roll) {
      Logger.warn("Selected trigger prompt item cannot create a chat card", { messageId: message.id, actorId: prompt.actorId, itemId: prompt.itemId });
      return;
    }

    if (item.type === "power" && actor.usePower) {
      await actor.usePower(item, { configureDialog: true });
      return;
    }

    await item.roll({ configureDialog: false });
  }

  /**
   * Displays the prompt's remaining response time in the Ignore button.
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
      return;
    }
    const countdown = setInterval(() => {
      if (update() === 0) {
        clearInterval(countdown);
      }
    }, 250);
  }
}
