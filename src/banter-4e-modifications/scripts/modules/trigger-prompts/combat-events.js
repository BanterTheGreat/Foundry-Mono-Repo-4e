import { attackTypeOf } from "./trigger-filters.js";
import { Logger } from "../../shared/logger.js";

/**
 * Normalized combat events consumed by trigger definitions.
 *
 * Adapters turn Foundry hooks, DnD4e chat messages, and Player Defense results
 * into these shapes; nothing downstream reads chat text or hook arguments. An
 * event describes something that already happened, using token references
 * (`{sceneId, tokenId}`) rather than documents so it can be logged and tested.
 */
export const COMBAT_EVENT_TYPE = Object.freeze({
  ATTACK_TARGETED: "attack-targeted",
  ATTACK_RESOLVED: "attack-resolved",
  MOVEMENT_COMMITTED: "movement-committed",
  HP_CHANGED: "hp-changed",
  SAVE_RESOLVED: "save-resolved",
});

/**
 * How a token moved. Shift movement does not provoke opportunity attacks.
 * Mixed native paths additionally carry their non-Shift opportunity segments.
 */
export const MOVEMENT_TYPE = Object.freeze({
  WALK: "walk",
  SHIFT: "shift",
  FORCED: "forced",
  TELEPORT: "teleport",
});

let eventSequence = 0;

/**
 * Stamps the fields shared by every event.
 *
 * @param {string} type
 * @param {object} fields
 * @returns {object}
 */
function createEvent(type, fields) {
  eventSequence += 1;
  return { id: `event-${Date.now().toString(36)}-${eventSequence}`, type, timestamp: Date.now(), ...fields };
}

/**
 * Describes one attack resolved against one target.
 *
 * @param {{attackId?: string|null, attacker: {sceneId: string, tokenId: string}, target: {sceneId: string, tokenId: string}, outcome: "hit"|"miss", defenseType?: string|null, attackRange?: string|null, natural?: number|null, total?: number|null}} fields
 * @returns {object}
 *   `isMelee` is derived from `attackRange`; `defenseType` is lower-cased.
 */
export function createAttackResolvedEvent({ attackId = null, attacker, target, outcome, defenseType = null, attackRange = null, natural = null, total = null, isOpportunity = false, itemUuid = null }) {
  return createEvent(COMBAT_EVENT_TYPE.ATTACK_RESOLVED, {
    attackId,
    attacker,
    target,
    outcome,
    defenseType: typeof defenseType === "string" ? defenseType.toLowerCase() : null,
    attackRange,
    attackType: attackTypeOf(attackRange),
    isOpportunity,
    itemUuid,
    isMelee: isMeleeRange(attackRange),
    natural,
    total,
  });
}

/** Describe target selection separately from the later, possibly reviewed verdict. */
export function createAttackTargetedEvents(capture) {
  const targetIds = capture.targets.map(target => target.tokenId);
  return capture.targets.map(target => ({
    ...createAttackResolvedEvent({
      attacker: { sceneId: capture.sceneId, tokenId: capture.attackerTokenId },
      target: { sceneId: target.sceneId, tokenId: target.tokenId },
      attackRange: capture.attackRange, defenseType: target.defenseType,
      isOpportunity: capture.isOpportunity, itemUuid: capture.itemUuid,
    }),
    type: COMBAT_EVENT_TYPE.ATTACK_TARGETED, targetIds,
  }));
}

/**
 * Describes a committed token move as the path it travelled.
 *
 * @param {{sceneId: string, tokenId: string, path: Array<{x: number, y: number}>, movementType?: string, opportunityPaths?: Array<Array<{x: number, y: number}>>}} fields
 *   `path` holds token top-left positions from the origin to the destination.
 * @returns {object}
 */
export function createMovementCommittedEvent({ sceneId, tokenId, path, movementType = MOVEMENT_TYPE.WALK, opportunityPaths }) {
  return createEvent(COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED, { mover: { sceneId, tokenId }, path, movementType, ...(opportunityPaths ? { opportunityPaths } : {}) });
}

/**
 * Describes a hit-point change on one token.
 *
 * @param {{sceneId: string, tokenId: string, oldHp: number, newHp: number, bloodiedThreshold: number, attacker?: {sceneId: string, tokenId: string}|null}} fields
 * @returns {object}
 *   Threshold flags describe crossings, not a creature already below them.
 *   `attacker` is set only when a damage receipt identifies the source.
 */
export function createHpChangedEvent({ sceneId, tokenId, oldHp, newHp, bloodiedThreshold, attacker = null, attackRange = null, damageTypes = [], damageTaken = oldHp - newHp }) {
  return createEvent(COMBAT_EVENT_TYPE.HP_CHANGED, {
    subject: { sceneId, tokenId },
    oldHp,
    newHp,
    damageTaken: Math.max(0, damageTaken),
    damageTypes,
    attackType: attackTypeOf(attackRange),
    bloodiedThreshold,
    becameBloodied: oldHp > bloodiedThreshold && newHp <= bloodiedThreshold,
    reducedToZero: oldHp > 0 && newHp <= 0,
    attacker,
    isMelee: isMeleeRange(attackRange),
  });
}

/**
 * Describes a resolved saving throw.
 *
 * @param {{sceneId: string|null, tokenId: string|null, actorId: string|null, outcome: "success"|"fail"}} fields
 * @returns {object}
 */
export function createSaveResolvedEvent({ sceneId, tokenId, actorId, outcome }) {
  return createEvent(COMBAT_EVENT_TYPE.SAVE_RESOLVED, { subject: { sceneId, tokenId, actorId }, outcome });
}

/**
 * Converts one completed, captured attack into an event per target.
 *
 * Targets whose outcome cannot be determined are skipped.
 *
 * @param {object} capturedAttack
 *   Completed capture from {@link import("./attack-result-capture.js").AttackResultCapture}.
 * @returns {object[]}
 */
export function createAttackEventsFromCapture(capturedAttack) {
  const attacker = { sceneId: capturedAttack.sceneId, tokenId: capturedAttack.attackerTokenId };
  const events = [];
  for (const targetData of capturedAttack.targets ?? []) {
    const outcome = determineAttackOutcome(capturedAttack, targetData);
    if (!outcome) {
      continue;
    }
    events.push(createAttackResolvedEvent({
      attackId: capturedAttack.attackId,
      attacker,
      target: { sceneId: targetData.sceneId, tokenId: targetData.tokenId },
      outcome,
      defenseType: targetData.defenseType,
      attackRange: capturedAttack.attackRange,
      isOpportunity: capturedAttack.isOpportunity,
      itemUuid: capturedAttack.itemUuid,
      natural: capturedAttack.natural,
      total: capturedAttack.total,
    }));
  }
  return events;
}

/**
 * Converts a Player Defense result into an attack event.
 *
 * @param {{attackerTokenId: string, sceneId: string, targetTokenId: string, targetSceneId: string, defenseType: string, attackRange: string|null}} defenseContext
 * @param {"hit"|"miss"} outcome
 * @returns {object}
 */
export function createAttackEventFromDefense(defenseContext, outcome) {
  return createAttackResolvedEvent({
    attacker: { sceneId: defenseContext.sceneId, tokenId: defenseContext.attackerTokenId },
    target: { sceneId: defenseContext.targetSceneId, tokenId: defenseContext.targetTokenId },
    outcome,
    defenseType: defenseContext.defenseType,
    attackRange: defenseContext.attackRange,
    isOpportunity: defenseContext.isOpportunity,
  });
}

/**
 * Lists the token references an event involves, keyed by role name.
 *
 * Trigger definitions address tokens by these role names.
 *
 * @param {object} event
 * @returns {Object<string, {sceneId: string|null, tokenId: string|null, actorId?: string|null}>}
 */
export function getEventRoles(event) {
  switch (event.type) {
    case COMBAT_EVENT_TYPE.ATTACK_TARGETED:
    case COMBAT_EVENT_TYPE.ATTACK_RESOLVED:
      return { attacker: event.attacker, target: event.target };
    case COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED:
      return { mover: event.mover };
    case COMBAT_EVENT_TYPE.HP_CHANGED:
      return { subject: event.subject, ...(event.attacker ? { attacker: event.attacker } : {}) };
    case COMBAT_EVENT_TYPE.SAVE_RESOLVED:
      return { subject: event.subject };
    default:
      return {};
  }
}

/**
 * Derives hit or miss from DnD4e data, honoring recorded misses and natural
 * 1/20 overrides before comparing the attack total with the defense.
 *
 * @param {object} capturedAttack
 * @param {object} targetData
 * @returns {"hit"|"miss"|null}
 */
export function determineAttackOutcome(capturedAttack, targetData) {
  if (targetData.missed || capturedAttack.natural === 1) {
    return "miss";
  }
  if (capturedAttack.natural === 20) {
    return "hit";
  }
  if (targetData.defense === null || targetData.defense === undefined || capturedAttack.total === undefined) {
    return null;
  }
  return capturedAttack.total < targetData.defense ? "miss" : "hit";
}

/**
 * Whether a DnD4e attack range string is a Weapon or Melee X attack.
 *
 * @param {string|null|undefined} attackRange
 * @returns {boolean}
 */
export function isMeleeRange(attackRange) {
  const range = typeof attackRange === "string" ? attackRange.trim().toLowerCase() : "";
  return ["weapon", "melee", "touch", "reach"].includes(range) || /^melee\s+\d+$/.test(range);
}

/** Resolve weapon attacks without classifying an explicitly ranged weapon as melee. */
export function attackRangeOf(item) {
  const system = item.system ?? item.data?.data ?? item;
  const range = item.rangeType ?? system.rangeType ?? system.attack?.range;
  const value = typeof range === "string" ? range : range?.value ?? null;
  return value === "weapon" && system.weaponType === "ranged" ? "range" : value;
}

/**
 * Delivers events to subscribers one at a time.
 *
 * A failing subscriber is logged and never prevents later events or other
 * subscribers from running.
 */
export class CombatEventBus {
  #listeners = new Set();

  /**
   * @param {(event: object) => Promise<void>|void} listener
   * @returns {() => void}
   *   Function that removes the subscription.
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Delivers an event to every subscriber, in subscription order.
   *
   * @param {object} event
   * @returns {Promise<void>}
   */
  async emit(event) {
    for (const listener of this.#listeners) {
      try {
        await listener(event);
      } catch (error) {
        Logger.error("Trigger event listener failed", { eventType: event.type, error: error.message });
      }
    }
  }

  /**
   * Delivers several events in order, each after the previous one finishes.
   *
   * @param {object[]} events
   * @returns {Promise<void>}
   */
  async emitAll(events) {
    for (const event of events) {
      await this.emit(event);
    }
  }
}
