import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { COMBAT_EVENT_TYPE } from "./combat-events.js";
import { MODULE_NAME } from "../../shared/globals.js";

export const COMBAT_CHALLENGE_SOCKET = "applyCombatChallenge";
const queues = new Map();
const completed = new Set();
const MARK_STATUS = /^mark(?:_[1-7])?$/;

/** Combat Challenge uses the same confirmed attack events as trigger prompts. */
export class CombatChallenge {
  /** Mark the complete native attack roster even when a defense or verdict is unavailable. */
  static async handleCapture(attack, socket) {
    for (const target of attack.targets) {
      await CombatChallenge.handle({ type: COMBAT_EVENT_TYPE.ATTACK_RESOLVED, attackId: attack.attackId,
        attacker: { sceneId: attack.sceneId, tokenId: attack.attackerTokenId },
        target: { sceneId: target.sceneId, tokenId: target.tokenId } }, socket);
    }
  }

  /** Confirmed automation marks retained, actually rolled targets, including immune targets. */
  static async handleAutomation(message, socket) {
    const attack = message.flags?.["dnd4e-health-display"]?.attackResults;
    if (!attack?.sessionId || attack.pending !== false) {
      return;
    }
    const rolled = new Set((message.rolls ?? []).map(roll => roll.options?.multirollData?.targetID));
    for (const target of message.flags?.playerDefense?.targets ?? []) {
      if (target.resolved) {
        rolled.add(target.tokenId);
      }
    }
    await CombatChallenge.handleCapture({ attackId: message.id, sceneId: attack.sceneId,
      attackerTokenId: attack.casterId,
      targets: (attack.targetIds ?? []).filter(id => rolled.has(id)).map(tokenId => ({ sceneId: attack.sceneId, tokenId })),
    }, socket);
  }

  /**
   * Ask the GM to apply a mark. No hit requirement: misses also mark.
   * Event references name scene tokens; the GM rechecks ownership and settings.
   */
  static async handle(event, socket) {
    if (event.type !== COMBAT_EVENT_TYPE.ATTACK_RESOLVED) {
      return;
    }
    const actor = game.scenes?.get(event.attacker?.sceneId)?.tokens.get(event.attacker?.tokenId)?.actor;
    if (!ActorTriggerConfiguration.isCombatChallengeEnabled(actor ?? {})) {
      return;
    }
    const request = { userId: game.user.id, attackId: event.attackId ?? event.id,
      attacker: event.attacker, target: event.target };
    if (game.user.isGM) {
      return CombatChallenge.apply(request);
    }
    if (!socket || !game.users.activeGM) {
      ui.notifications.warn("Combat Challenge needs a connected GM to mark the target.");
      return;
    }
    return socket.executeAsGM(COMBAT_CHALLENGE_SOCKET, request);
  }

  /** Serialize marks on one creature so simultaneous attacks cannot leave two marks. */
  static async apply(request) {
    if (!game.user.isGM) {
      throw new Error("Only a GM can apply Combat Challenge marks.");
    }
    const target = game.scenes.get(request?.target?.sceneId)?.tokens.get(request?.target?.tokenId);
    if (!target?.actor) {
      return;
    }
    const key = target.actor.uuid;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => CombatChallenge.#mark(request));
    queues.set(key, next);
    try {
      return await next;
    } finally {
      if (queues.get(key) === next) {
        queues.delete(key);
      }
    }
  }

  /** Validate the requester, actor option and combat before creating a native mark. */
  static async #mark(request) {
    const scene = game.scenes.get(request.attacker?.sceneId);
    const attacker = scene?.tokens.get(request.attacker?.tokenId);
    const target = scene?.tokens.get(request.target?.tokenId);
    const user = game.users.get(request.userId);
    const actor = attacker?.actor;
    const combat = game.combats.find(entry => entry.started && entry.scene?.id === scene?.id
      && entry.combatants.some(combatant => combatant.tokenId === attacker?.id));
    if (!actor || !target?.actor || !user?.active || !actor.testUserPermission(user, "OWNER")
      || !ActorTriggerConfiguration.isCombatChallengeEnabled(actor) || !combat
      || request.target.sceneId !== scene.id || attacker.id === target.id
      || target.actor.uuid === actor.uuid || target.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY
      || typeof request.attackId !== "string") {
      return;
    }
    const receipt = `${combat.id}:${request.attackId}:${target.id}`;
    if (completed.has(receipt)) {
      return;
    }
    const existing = Array.from(target.actor.effects.values()).filter(effect =>
      Array.from(effect.statuses).some(status => MARK_STATUS.test(status)));
    // Delete and recreate, including our own mark, to reset the native start turn.
    if (existing.length) {
      await target.actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id));
    }
    await target.actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Marked (Combat Challenge)", img: "systems/dnd4e/icons/statusEffects/mark_1.svg",
      origin: actor.uuid, statuses: ["mark"],
      // game.combat can briefly be null while a native multi-target attack runs.
      // Carry the validated encounter into every effect instead of consulting it again.
      start: CONFIG.ActiveEffect.documentClass.getEffectStart(combat),
      system: { durationType: "endOfUserTurn", changes: [
        { key: "system.marker", type: "override", value: actor.uuid, priority: null },
      ] },
      flags: { [MODULE_NAME]: { combatChallenge: { attackId: request.attackId } } },
    }]);
    completed.add(receipt);
    if (completed.size > 2000) {
      completed.delete(completed.values().next().value);
    }
  }
}
