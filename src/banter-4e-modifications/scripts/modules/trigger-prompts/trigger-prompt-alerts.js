import { PowerChatCards } from "../chat-rolls/power-chat-cards.js";
import { TRIGGER_PROMPT_FLAG, TRIGGER_PROMPT_TIMEOUT_MS } from "./constants.js";

/** Recipient-local views of pending chat prompts; all mutations still use the chat claim protocol. */
export class TriggerPromptAlerts {
  #alerts = new Map();
  #dismissed = new Set();

  /** @param {(message: ChatMessage, html: HTMLElement) => void} bindControls */
  constructor(bindControls) {
    this.bindControls = bindControls;
  }

  /**
   * Show each pending message once, independent of the chat sidebar's visibility.
   * Repeated chat renders must not restart the response window or replace focused controls.
   * @param {ChatMessage} message
   */
  show(message) {
    const prompt = message.flags?.[TRIGGER_PROMPT_FLAG];
    if (!prompt || !prompt.recipientIds?.includes(game.user.id) || prompt.used || Date.now() >= prompt.expiresAt) {
      this.remove(message.id);
      return;
    }
    if (this.#alerts.has(message.id) || this.#dismissed.has(message.id)) {
      return;
    }
    const escape = foundry.utils.escapeHTML;
    const actor = (prompt.actorUuid && globalThis.fromUuidSync?.(prompt.actorUuid)) || game.actors.get(prompt.actorId);
    // GMs read automatic benefits in public chat; a floating copy is redundant.
    // Also suppress legacy response prompts whose recipients included every GM.
    if (game.user.isGM && (prompt.automatic || game.users?.some(user => !user.isGM && actor?.testUserPermission?.(user, "OWNER")))) {
      this.remove(message.id);
      return;
    }
    const items = (prompt.choices ?? [{ itemId: prompt.itemId }]).map(choice => actor?.items.get(choice.itemId)).filter(Boolean);
    if (!items.length) {
      return;
    }
    let stack = document.getElementById("banter-trigger-alerts");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "banter-trigger-alerts";
      document.body.append(stack);
    }
    const alert = document.createElement("section");
    alert.className = "banter-trigger-alert";
    alert.dataset.messageId = message.id;
    alert.setAttribute("aria-label", `${actor.name}: ${prompt.label ?? "Trigger available"}`);
    const duration = prompt.automatic ? 6000 : TRIGGER_PROMPT_TIMEOUT_MS;
    const actions = prompt.automatic
      ? `${items.map(item => `<button type="button" disabled data-item-id="${escape(item.id)}" aria-label="${escape(item.name)}: Already used" title="Already used"><i class="fa-solid fa-check" aria-hidden="true"></i> ${escape(item.name)}</button>`).join("")}<button type="button" data-dismiss-automatic>Dismiss</button>`
      : `${items.map(item => `<button type="button" data-trigger-prompt-action="use" data-item-id="${escape(item.id)}">${escape(item.name)}</button>`).join("")}<button type="button" data-trigger-prompt-action="dismiss">Ignore</button>`;
    alert.innerHTML = `<div class="banter-trigger-alert__copy" role="status"><div class="banter-trigger-alert__label">${escape(actor.name)} · ${escape(prompt.label ?? "Trigger available")}</div><div class="banter-trigger-alert__cause">${escape(prompt.detail ?? "A configured trigger occurred.")}</div></div><div class="banter-trigger-alert__actions">${actions}</div><div class="banter-trigger-alert__track" role="progressbar" aria-label="Response time remaining" aria-valuemin="0" aria-valuemax="${duration / 1000}"><div class="banter-trigger-alert__drain"></div></div><div class="banter-trigger-alert__tooltip" role="tooltip" hidden></div>`;
    const remaining = Math.max(0, prompt.expiresAt - Date.now());
    const bar = alert.querySelector(".banter-trigger-alert__drain");
    bar.style.animationDuration = `${duration}ms`;
    bar.style.animationDelay = `-${duration - Math.min(remaining, duration)}ms`;
    const tooltip = alert.querySelector("[role=tooltip]");
    tooltip.id = `banter-trigger-power-${message.id}`;
    let hoveredItem = null;
    let tooltipRequest = 0;
    const hideTooltip = () => {
      tooltipRequest += 1;
      tooltip.hidden = true;
    };
    const showTooltip = async item => {
      hoveredItem = item;
      const request = ++tooltipRequest;
      try {
        const content = await TriggerPromptAlerts.powerDetails(item, actor);
        if (request !== tooltipRequest || !alert.isConnected) {
          return;
        }
        tooltip.innerHTML = content;
        tooltip.hidden = false;
      } catch (error) {
        console.warn("Banter | Could not prepare trigger power tooltip", error);
      }
    };
    if (items.length === 1) {
      alert.addEventListener("mouseenter", () => showTooltip(items[0]));
    } else {
      alert.addEventListener("mouseover", event => {
        if (!event.target.closest("[data-item-id], [role=tooltip]")) {
          hideTooltip();
        }
      });
    }
    alert.addEventListener("mouseleave", () => {
      if (!alert.contains(document.activeElement)) {
        hideTooltip();
      }
    });
    alert.addEventListener("focusout", event => {
      if (!alert.contains(event.relatedTarget)) {
        hideTooltip();
      }
    });
    alert.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        hideTooltip();
        event.stopPropagation();
      }
    });
    for (const button of alert.querySelectorAll("[data-item-id]")) {
      const item = items.find(candidate => candidate.id === button.dataset.itemId);
      button.setAttribute("aria-describedby", tooltip.id);
      button.addEventListener("mouseenter", () => {
        if (hoveredItem !== item || tooltip.hidden) {
          showTooltip(item);
        }
      });
      button.addEventListener("focus", () => showTooltip(item));
    }
    stack.append(alert);
    const timer = setTimeout(() => this.remove(message.id), remaining);
    this.#alerts.set(message.id, { element: alert, timer });
    if (prompt.automatic) {
      alert.querySelector("[data-dismiss-automatic]").addEventListener("click", () => {
        this.#dismissed.add(message.id);
        this.remove(message.id);
      });
    } else {
      this.bindControls(message, alert);
    }
  }

  /** Remove a local view and its timer when the shared prompt changes or expires. */
  remove(messageId) {
    const alert = this.#alerts.get(messageId);
    if (!alert) {
      return;
    }
    clearTimeout(alert.timer);
    alert.element.remove();
    this.#alerts.delete(messageId);
    const stack = document.getElementById("banter-trigger-alerts");
    if (!stack?.children.length) {
      stack?.remove();
    }
  }

  /** Render the same range icon, title and usage badge as a power chat card. */
  static powerHeader(item) {
    const escape = foundry.utils.escapeHTML;
    const system = item.system ?? {};
    const usage = ["atwill", "encounter", "daily"].includes(system.useType) ? system.useType : "other";
    const label = { atwill: "At-Will", encounter: "Encounter", daily: "Daily" }[usage]
      ?? (["feat", "feature"].includes(item.type) ? "Feat" : "Power");
    const range = PowerChatCards.rangeIcon({ flags: { dnd4e: { itemData: { system } } } }, { dataset: {} });
    return `<div class="banter-power banter-power--${usage} banter-trigger-tooltip-header"><header class="banter-power__header"><h3 class="banter-power__heading"><i class="banter-power__range-icon fa-solid ${range.icon}" role="img" aria-label="${range.label}" title="${range.label}"></i>${escape(item.name)}</h3><div class="banter-power__usage">${label}</div></header></div>`;
  }

  /**
   * Read the assigned power's rules, enriching links and formulas with its actor's roll data.
   * @param {Item} item
   * @param {Actor} actor
   * @returns {Promise<string>}
   */
  static async powerDetails(item, actor) {
    const header = TriggerPromptAlerts.powerHeader(item);
    if (globalThis.game?.modules?.get("dnd4e-health-display")?.active) {
      const { generateInlinePowerDetails } = await import("../../../../dnd4e-health-display/scripts/actor-display/actor-display-tooltips.js");
      const { html } = await generateInlinePowerDetails(actor, item);
      return `${header}<div class="dnd4e-info-tooltip">${html || "<p>No rules text available.</p>"}</div>`;
    }
    const system = item.system ?? {};
    const rules = [
      ["", system.description?.chat || system.description?.value],
      ["Requirement", system.requirement], ["Trigger", system.trigger],
      ["Target", system.target], ["Attack", system.attack?.detail],
      ["Hit", system.hit?.detail], ["Miss", system.miss?.detail],
      ["Effect", system.effect?.detail], ["Special", system.special],
      ["Sustain", system.sustain?.detail],
    ].filter(([, value]) => typeof value === "string" && value.trim());
    let content = rules.map(([label, value]) => `<div>${label ? `<b>${label}:</b> ` : ""}${value}</div>`).join("");
    // DnD4e 0.9.3 uses this pure formatter in Item#roll. Do not call roll here:
    // even createMessage:false executes the power's macros.
    if (system.autoGenChatPowerCard && item.getChatData) {
      const { preparePowerCardData } = await import("/systems/dnd4e/module/utils/utils.mjs");
      const attackBonus = item.hasAttack ? await item.getAttackBonus() : null;
      content = preparePowerCardData(await item.getChatData(), item.getRollData(), attackBonus);
    }
    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content, {
      secrets: false, async: true, relativeTo: item, rollData: actor.getRollData(),
    });
    return `${header}${enriched || "<p>No rules text available.</p>"}`;
  }
}

