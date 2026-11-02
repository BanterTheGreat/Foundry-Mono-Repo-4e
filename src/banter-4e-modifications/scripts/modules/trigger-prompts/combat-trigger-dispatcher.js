import { Logger } from "../../shared/logger.js";
import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { findTriggersForEvent } from "./trigger-definitions.js";
import { evaluateTriggerDefinition } from "./trigger-evaluator.js";
import { createTriggerServices } from "./trigger-services.js";

/**
 * Turns combat events into delivered prompts.
 *
 * `handle` is the only entry point: every adapter reports through the event
 * bus, and this class evaluates each event against the definitions that listen
 * for it. It runs on whichever client caused the event, so it needs no GM and
 * no election; each event is seen by exactly one client.
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
   * Evaluates one event during a started combat and delivers its prompts.
   *
   * One failing definition is logged and does not stop the others.
   *
   * @param {object} event
   *   A normalized event from `combat-events.js`.
   * @returns {Promise<void>}
   */
  async handle(event) {
    const sceneId = event.attacker?.sceneId ?? event.subject?.sceneId ?? event.mover?.sceneId;
    // Native pre-create hooks can run while Foundry temporarily has no viewed
    // combat. The event names its scene; never borrow another scene's encounter.
    const combat = game.combat ?? game.combats?.find(candidate => candidate.started && candidate.scene?.id === sceneId);
    if (!combat?.started) {
      return;
    }
    Logger.info("Evaluating trigger event", { type: event.type, id: event.id });
    const services = createTriggerServices({
      combat,
      scenes: game.scenes,
      getGridSize: sceneId => game.scenes.get(sceneId)?.grid?.size ?? canvas.grid.size,
    });
    for (const trigger of findTriggersForEvent(event.type)) {
      try {
        for (const promptContext of evaluateTriggerDefinition(trigger, event, services)) {
          await this.#createPrompt(trigger, { ...promptContext, combatId: combat.id });
        }
      } catch (error) {
        Logger.error("Trigger evaluation failed", { triggerId: trigger.id, eventType: event.type, error: error.message });
      }
    }
  }

  /**
   * Resolves eligible powers and active recipients, then creates a prompt.
   *
   * @param {object} trigger
   * @param {{actor: Actor, sourceName: string, detail: string, distanceSquares?: number}} promptContext
   * @returns {Promise<void>}
   */
  async #createPrompt(trigger, promptContext) {
    const assignments = ActorTriggerConfiguration.eligibleAssignmentsFor(promptContext.actor, trigger, promptContext);
    if (!assignments.length) {
      return;
    }
    const recipientIds = game.users
      .filter(user => user.active && (user.isGM || promptContext.actor.testUserPermission(user, "OWNER")))
      .map(user => user.id);
    if (!recipientIds.length) {
      Logger.info("No active recipient for trigger prompt", { triggerId: trigger.id, actorId: promptContext.actor.id });
      return;
    }
    await this.promptChat.createPromptCard({ trigger, actor: promptContext.actor, assignments, context: promptContext, recipientIds });
  }
}
