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
  ATTACK_RESOLVED: "attack-resolved",
  MOVEMENT_COMMITTED: "movement-committed",
  HP_CHANGED: "hp-changed",
  SAVE_RESOLVED: "save-resolved",
});

/**
 * How a token moved. Recorded on every movement event so later triggers can
 * tell a walk from a shift or a forced move, but no trigger reads it yet:
 * every move is currently treated as a walk.
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
export function createAttackResolvedEvent({ attackId = null, attacker, target, outcome, defenseType = null, attackRange = null, natural = null, total = null }) {
  return createEvent(COMBAT_EVENT_TYPE.ATTACK_RESOLVED, {
    attackId,
    attacker,
    target,
    outcome,
    defenseType: typeof defenseType === "string" ? defenseType.toLowerCase() : null,
    attackRange,
    isMelee: isMeleeRange(attackRange),
    natural,
    total,
  });
}

/**
 * Describes a committed token move as the path it travelled.
 *
 * @param {{sceneId: string, tokenId: string, path: Array<{x: number, y: number}>, movementType?: string}} fields
 *   `path` holds token top-left positions from the origin to the destination.
 * @returns {object}
 */
export function createMovementCommittedEvent({ sceneId, tokenId, path, movementType = MOVEMENT_TYPE.WALK }) {
  return createEvent(COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED, { mover: { sceneId, tokenId }, path, movementType });
}

/**
 * Describes a hit-point change on one token.
 *
 * @param {{sceneId: string, tokenId: string, oldHp: number, newHp: number, bloodiedThreshold: number}} fields
 * @returns {object}
 *   `becameBloodied` is true when the change crossed the bloodied threshold.
 */
export function createHpChangedEvent({ sceneId, tokenId, oldHp, newHp, bloodiedThreshold }) {
  return createEvent(COMBAT_EVENT_TYPE.HP_CHANGED, {
    subject: { sceneId, tokenId },
    oldHp,
    newHp,
    bloodiedThreshold,
    becameBloodied: oldHp > bloodiedThreshold && newHp <= bloodiedThreshold,
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
    case COMBAT_EVENT_TYPE.ATTACK_RESOLVED:
      return { attacker: event.attacker, target: event.target };
    case COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED:
      return { mover: event.mover };
    case COMBAT_EVENT_TYPE.HP_CHANGED:
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
  return range === "weapon" || range === "melee" || /^melee\s+\d+$/.test(range);
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
