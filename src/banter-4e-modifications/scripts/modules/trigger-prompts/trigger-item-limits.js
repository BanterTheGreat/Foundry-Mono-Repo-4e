import { MODULE_NAME } from "../../shared/globals.js";
import { TRIGGER_CONFIGURATION_FLAG, TRIGGER_PROMPT_TIMEOUT_MS, TRIGGER_SOCKET_ACTION } from "./constants.js";
import { ItemTriggerAssignments } from "./item-trigger-assignments.js";

const USAGE_FLAG = "trigger-prompt-usage";
const REST_WRAPPED = Symbol.for("banter.triggerPromptRest");

/**
 * Persist one shared allowance per item, across its trigger rows and clients.
 * The active GM (or a stable online actor owner without a GM) serializes offers,
 * claims and releases. A pending ticket prevents two simultaneous prompts;
 * claims recheck the saved ticket and current scope after reload or turn change.
 * First-encounter limits record the first offer, even if ignored. Other limits
 * are spent on selection, and Ignore releases their pending reservation.
 */
export class TriggerItemLimits {
  #queue = Promise.resolve();

  /** @param {object} socket Registered SocketLib module. */
  constructor(socket) {
    this.socket = socket;
  }

  /** Return the current turn/encounter scope; daily allowances last until rest. */
  static scope(limit, combatId = null) {
    const combat = combatId ? game.combats?.get(combatId) : game.combat;
    if (limit === "day") {
      return "day";
    }
    if (!combat?.started) {
      return null;
    }
    // Initiative reordering can change the turn index without starting a new turn.
    return limit === "turn" ? `${combat.id}:${combat.round}:${combat.combatant?.id}` : combat.id;
  }

  /** Route a limit operation to one client allowed to write the item's flags. */
  async request(item, operation, ticket = null, combatId = ticket?.combatId ?? null) {
    if (ItemTriggerAssignments.limit(item) === "none" && operation !== "reset" && !operation.startsWith("opportunity")) {
      return operation === "offer" ? { unrestricted: true } : true;
    }
    const owners = [...game.users.values()].filter(user => user.active && item.actor?.testUserPermission(user, "OWNER"));
    const keeper = game.users.activeGM ?? owners.sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!keeper) {
      return null;
    }
    const request = { itemUuid: item.uuid, operation, ticket, ...(combatId ? { combatId } : {}) };
    return keeper.id === game.user.id ? this.handle(request)
      : this.socket.executeAsUser(TRIGGER_SOCKET_ACTION.ITEM_LIMIT, keeper.id, request);
  }

  /** Serialize operations on this authority, including requests from other clients. */
  handle(request) {
    const result = this.#queue.then(() => this.#apply(request));
    this.#queue = result.catch(() => {});
    return result;
  }

  /** Validate a request against current documents; only this authority writes usage. */
  async #apply({ itemUuid, operation, ticket, combatId = ticket?.combatId ?? null }) {
    const item = globalThis.fromUuidSync?.(itemUuid);
    if (!item?.actor || !item.isOwner) {
      return null;
    }
    if (operation.startsWith("opportunity")) {
      return this.#applyOpportunity(item, operation, ticket, combatId);
    }
    const limit = ItemTriggerAssignments.limit(item);
    const state = item.getFlag(MODULE_NAME, USAGE_FLAG) ?? {};
    if (operation === "reset") {
      if (limit === "day") {
        await item.setFlag(MODULE_NAME, USAGE_FLAG, { used: null, pending: null });
      }
      return true;
    }
    const scope = TriggerItemLimits.scope(limit, combatId);
    if (!scope || limit === "none") {
      return null;
    }
    if (operation === "offer") {
      if (state.used === `${limit}:${scope}` || state.pending?.scope === scope && state.pending.limit === limit && state.pending.expiresAt > Date.now()) {
        return null;
      }
      const pending = { id: foundry.utils.randomID(), limit, scope, ...(combatId ? { combatId } : {}), expiresAt: Date.now() + TRIGGER_PROMPT_TIMEOUT_MS };
      await item.setFlag(MODULE_NAME, USAGE_FLAG, {
        used: limit === "firstEncounter" ? `${limit}:${scope}` : state.used ?? null,
        pending,
      });
      return pending;
    }
    if (!ticket || state.pending?.id !== ticket.id) {
      return false;
    }
    if (operation === "release") {
      await item.setFlag(MODULE_NAME, USAGE_FLAG, { pending: null });
      return true;
    }
    if (operation !== "claim" || state.pending.limit !== limit || state.pending.scope !== scope
      || ticket.limit !== state.pending.limit || ticket.scope !== state.pending.scope || state.pending.expiresAt <= Date.now()) {
      return false;
    }
    await item.setFlag(MODULE_NAME, USAGE_FLAG, { used: `${limit}:${scope}`, pending: null });
    return true;
  }

  /**
   * Keep one offer per enemy token per turn and one claimed opportunity attack
   * across all of an actor's powers. Ignore/expiry do not erase enemy history.
   * This runs on the same elected authority and queue as item allowances.
   */
  async #applyOpportunity(item, operation, ticket, combatId) {
    const actor = item.actor;
    const scope = TriggerItemLimits.scope("turn", combatId);
    if (!scope || !ticket?.sourceKey) {
      return null;
    }
    const saved = actor.getFlag(MODULE_NAME, "opportunity-prompt-usage");
    const state = saved?.scope === scope ? saved : { scope, enemies: [], used: false };
    const limited = actor.getFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG)?.opportunityAttack?.oncePerTurn !== false;
    if (limited && state.used) {
      return null;
    }
    if (operation === "opportunityOffer") {
      if (state.enemies.includes(ticket.sourceKey)) {
        return null;
      }
      await actor.setFlag(MODULE_NAME, "opportunity-prompt-usage", { ...state, enemies: [...state.enemies, ticket.sourceKey] });
      return { scope, sourceKey: ticket.sourceKey, combatId };
    }
    if (operation !== "opportunityClaim" || ticket.scope !== scope || !state.enemies.includes(ticket.sourceKey)) {
      return null;
    }
    if (ticket.itemTicket && !await this.#apply({ itemUuid: item.uuid, operation: "claim", ticket: ticket.itemTicket, combatId })) {
      return null;
    }
    await actor.setFlag(MODULE_NAME, "opportunity-prompt-usage", { ...state, used: true });
    return true;
  }

  /** Reset daily feat allowances only after the native Extended Rest completes. */
  static registerRest() {
    const prototype = CONFIG.Actor.documentClass.prototype;
    if (prototype[REST_WRAPPED]) {
      return;
    }
    const original = prototype.longRest;
    prototype.longRest = async function (...args) {
      const result = await original.apply(this, args);
      const limits = game.TriggerPrompts?.limits;
      if (limits) {
        for (const item of this.items.values()) {
          if (ItemTriggerAssignments.limit(item) === "day") {
            await limits.request(item, "reset");
          }
        }
      }
      return result;
    };
    Object.defineProperty(prototype, REST_WRAPPED, { value: true });
  }
}
