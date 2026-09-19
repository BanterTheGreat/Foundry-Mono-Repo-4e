import { TRIGGER_EVENT_TYPE, TRIGGER_ID } from "./constants.js";
import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { findTriggerById, TRIGGERS } from "./trigger-registry.js";

/**
 * Evaluates combat events on the primary GM and delivers eligible prompts.
 *
 * This is the authority seam for Trigger Prompts: only the elected primary GM
 * resolves combat documents, evaluates definitions, and creates chat cards.
 */
export class CombatTriggerDispatcher {
  /**
   * @param {import("./trigger-prompt-chat.js").TriggerPromptChat} promptChat
   *   Chat-card module used after an actor and its eligible powers are found.
   */
  constructor(promptChat) {
    this.promptChat = promptChat;
  }

  /**
   * Evaluates every configured attack-result trigger for each attacked token.
   *
   * @param {object} context
   *   Captured attacker, target, defense, defense-type, total, and natural-d20 data.
   * @returns {Promise<void>}
   */
  async evaluateCapturedAttack(attackContext) {
    if (!this.#canEvaluate()) {
      return;
    }
    const attacker = this.#findCombatantByToken(attackContext.sceneId, attackContext.attackerTokenId);
    if (!attacker) {
      return;
    }
    for (const targetData of attackContext.targets ?? []) {
      const target = this.#findCombatantByToken(targetData.sceneId, targetData.tokenId);
      if (!target) {
        continue;
      }
      const outcome = this.#determineAttackOutcome(attackContext, targetData);
      if (!outcome) {
        continue;
      }
      await this.#evaluateAttackResultTriggers({ type: TRIGGER_EVENT_TYPE.ATTACK_RESULT, outcome, defenseType: targetData.defenseType, attackRange: attackContext.attackRange, attacker, target });
    }
  }

  /**
   * Evaluates a completed saving throw that was captured from DnD4e chat.
   *
   * @param {{actor: {actorId: string|null, sceneId: string|null, tokenId: string|null}, outcome: "success"|"fail"}} savingThrowContext
   * @returns {Promise<void>}
   */
  async evaluateSavingThrow(savingThrowContext) {
    if (!this.#canEvaluate()) {
      return;
    }
    await this.#evaluateTrigger(TRIGGER_ID.FAILS_SAVING_THROW, {
      type: TRIGGER_EVENT_TYPE.SAVING_THROW_RESULT,
      ...savingThrowContext,
    });
  }

  /**
   * Evaluates movement-based triggers using the token's old position and its
   * pending destination.
   *
   * @param {TokenDocument} document
   * @param {object} changes
   * @returns {Promise<void>}
   */
  async evaluateTokenMovement(document, changes) {
    if (!this.#canEvaluate()) {
      return;
    }
    const combatant = this.#findCombatantByToken(document.parent.id, document.id);
    if (!combatant) {
      return;
    }
    await this.#evaluateTrigger(TRIGGER_ID.OPPORTUNITY_ATTACK, {
      type: TRIGGER_EVENT_TYPE.MOVEMENT,
      combatant,
      sceneId: document.parent.id,
      tokenId: document.id,
      destination: {
        x: changes.x ?? document.x,
        y: changes.y ?? document.y,
      },
    });
    await this.#evaluateTrigger(TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT, {
      type: TRIGGER_EVENT_TYPE.MOVEMENT,
      combatant,
      sceneId: document.parent.id,
      tokenId: document.id,
      destination: {
        x: changes.x ?? document.x,
        y: changes.y ?? document.y,
      },
    });
  }

  /**
   * Dispatches a bloodied event when HP crosses the actor's threshold.
   *
   * @param {Actor} actor
   * @param {object} changes
   * @param {object} options
   */
  async evaluateBloodiedTransition(actor, changes, options) {
    if (!this.#canEvaluate()) {
      return;
    }
    const oldHp = options.dnd4e?.hp?.hp;
    const newHp = actor.system.attributes?.hp?.value;
    const threshold = actor.system.details?.bloodied ?? actor.system.attributes?.hp?.max / 2;
    if (!Number.isFinite(oldHp) || !Number.isFinite(newHp) || oldHp <= threshold || newHp > threshold) {
      return;
    }
    for (const combatant of game.combat.combatants) {
      if (combatant.actor?.uuid === actor.uuid) {
        await this.#evaluateTrigger(TRIGGER_ID.YOU_BECOME_BLOODIED, {
          type: TRIGGER_EVENT_TYPE.BLOODIED,
          combatant,
          sceneId: combatant.sceneId,
          tokenId: combatant.tokenId,
        });
        await this.#evaluateTrigger(TRIGGER_ID.MARKED_CREATURE_BLOODIED, {
          type: TRIGGER_EVENT_TYPE.BLOODIED,
          combatant,
          sceneId: combatant.sceneId,
          tokenId: combatant.tokenId,
        });
      }
    }
  }

  /**
   * Evaluates an outcome produced by the optional Player Defense workflow.
   *
   * @param {object} context
   * @param {"hit"|"miss"} outcome
   * @returns {Promise<void>}
   */
  async evaluateActiveDefenseOutcome(activeDefenseContext, outcome) {
    if (!this.#canEvaluate()) {
      return;
    }
    const attacker = this.#findCombatantByToken(activeDefenseContext.sceneId, activeDefenseContext.attackerTokenId);
    const target = this.#findCombatantByToken(activeDefenseContext.targetSceneId, activeDefenseContext.targetTokenId);
    if (attacker && target) {
      await this.#evaluateAttackResultTriggers({ type: TRIGGER_EVENT_TYPE.ATTACK_RESULT, outcome, defenseType: activeDefenseContext.defenseType, attackRange: activeDefenseContext.attackRange, attacker, target });
    }
  }

  /**
   * Evaluates one registered trigger and delivers every returned prompt context.
   *
   * @param {string} triggerId
   * @param {object} event
   * @returns {Promise<void>}
   */
  async #evaluateTrigger(triggerId, event) {
    const trigger = findTriggerById(triggerId);
    if (!trigger) {
      return;
    }
    const promptContexts = trigger.evaluate(event, this.#createTriggerServices());
    for (const promptContext of promptContexts) {
      await this.#createPromptForContext(trigger, promptContext);
    }
  }

  /**
   * Evaluates all registered definitions against a resolved attack result.
   *
   * Definitions that do not handle attack results return no prompt contexts.
   *
   * @param {object} event
   * @returns {Promise<void>}
   */
  async #evaluateAttackResultTriggers(event) {
    for (const trigger of TRIGGERS) {
      await this.#evaluateTrigger(trigger.id, event);
    }
  }

  /**
   * Resolves eligible powers and active recipients, then creates a prompt.
   *
   * @param {object} trigger
   * @param {{actor: Actor, detail: string}} context
   * @returns {Promise<void>}
   */
  async #createPromptForContext(trigger, promptContext) {
    const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(promptContext.actor, trigger, promptContext);
    if (!assignments.length) {
      return;
    }
    const recipientIds = game.users.filter(user => user.active && (user.isGM || promptContext.actor.testUserPermission(user, "OWNER"))).map(user => user.id);
    await this.promptChat.createPromptCard({ trigger, actor: promptContext.actor, assignments, context: promptContext, recipientIds });
  }

  /** @returns {boolean} Whether this client is the active combat's primary GM. */
  #canEvaluate() { return game.user.isGM && game.combat?.started && game.users.filter(user => user.active && user.isGM).sort((left, right) => left.id.localeCompare(right.id))[0]?.id === game.user.id; }

  /** @returns {Combatant|undefined} Combatant occupying the supplied scene token. */
  #findCombatantByToken(sceneId, tokenId) { return game.combat?.combatants.find(combatant => combatant.sceneId === sceneId && combatant.tokenId === tokenId); }

  /** @returns {TokenDocument|undefined} Token document in the supplied scene. */
  #findSceneToken(sceneId, tokenId) { return game.scenes.get(sceneId)?.tokens.get(tokenId); }

  /**
   * Builds the narrow Foundry adapter exposed to pure trigger definitions.
   *
   * @returns {object}
   */
  #createTriggerServices() { return { combatants: game.combat.combatants, getToken: (sceneId, tokenId) => this.#findSceneToken(sceneId, tokenId), findCombatant: actor => this.#findCombatantForActor(actor), markOwner: target => this.#findMarkOwner(target), areHostile: (left, right) => left.disposition !== right.disposition, areAllies: (left, right) => left.disposition === right.disposition, distanceSquares: (left, right) => this.#calculateDistanceSquares(left, right), movesAdjacent: (mover, destination, candidate) => this.#doesMovementPassAdjacentTo(mover, destination, candidate) }; }

  /**
   * Finds a combatant for a roll's speaker, preferring its exact token.
   *
   * @param {{actorId: string|null, sceneId: string|null, tokenId: string|null}} actor
   * @returns {Combatant|undefined}
   */
  #findCombatantForActor(actor) {
    const tokenCombatant = actor.sceneId && actor.tokenId ? this.#findCombatantByToken(actor.sceneId, actor.tokenId) : null;
    return tokenCombatant ?? game.combat?.combatants.find(combatant => combatant.actor?.id === actor.actorId);
  }

  /**
   * Resolves a marked token's owner from DnD4e's actor-level marker UUID.
   *
   * DnD4e records the actor applying a Mark at `actor.system.marker`. Prompts
   * are combat events, so this deliberately returns only the active
   * combatant represented by that actor.
   *
   * @param {TokenDocument} target
   * @returns {TokenDocument|null}
   */
  #findMarkOwner(target) {
    const markerActorUuid = target.actor?.system?.marker;
    if (!markerActorUuid) {
      return null;
    }
    const markerCombatant = game.combat?.combatants.find(combatant => combatant.actor?.uuid === markerActorUuid);
    return markerCombatant ? this.#findSceneToken(markerCombatant.sceneId, markerCombatant.tokenId) : null;
  }

  /**
   * Derives hit or miss from DnD4e data, honoring recorded misses and natural
   * 1/20 overrides before comparing the attack total with the defense.
   *
   * @param {object} context
   * @param {object} target
   * @returns {"hit"|"miss"|null}
   */
  #determineAttackOutcome(attackContext, target) {
    if (target.missed || attackContext.natural === 1) {
      return "miss";
    }
    if (attackContext.natural === 20) {
      return "hit";
    }
    if (target.defense === null || attackContext.total === undefined) {
      return null;
    }
    return attackContext.total < target.defense ? "miss" : "hit";
  }

  /**
   * Measures Chebyshev distance between token centers in grid squares.
   *
   * @param {TokenDocument} left
   * @param {TokenDocument} right
   * @returns {number}
   */
  #calculateDistanceSquares(left, right) {
    const gridSize = canvas.grid.size;
    const leftCenter = { x: left.x + left.width * gridSize / 2, y: left.y + left.height * gridSize / 2 };
    const rightCenter = { x: right.x + right.width * gridSize / 2, y: right.y + right.height * gridSize / 2 };
    return Math.max(Math.abs(leftCenter.x - rightCenter.x), Math.abs(leftCenter.y - rightCenter.y)) / gridSize;
  }

  /**
   * Checks whether movement starts or passes adjacent to a candidate token.
   *
   * The final destination point is excluded so ending adjacent without moving
   * while adjacent does not qualify as an opportunity-attack event.
   *
   * @param {TokenDocument} mover
   * @param {{x: number, y: number}} destination
   * @param {TokenDocument} candidate
   * @returns {boolean}
   */
  #doesMovementPassAdjacentTo(mover, destination, candidate) {
    const gridSize = canvas.grid.size;
    const distance = Math.max(Math.abs(destination.x - mover.x), Math.abs(destination.y - mover.y));
    const steps = Math.max(1, Math.ceil(distance / gridSize));
    // An opportunity attack needs movement while adjacent. Ending adjacent is
    // not enough, so deliberately exclude the final destination square.
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      const x = mover.x + (destination.x - mover.x) * progress;
      const y = mover.y + (destination.y - mover.y) * progress;
      if (Math.max(Math.abs(x - candidate.x), Math.abs(y - candidate.y)) <= gridSize) {
        return true;
      }
    }
    return false;
  }
}
