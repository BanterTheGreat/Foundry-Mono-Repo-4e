/**
 * Base contract for a combat trigger definition.
 *
 * A trigger decides whether an event qualifies and returns actor-specific
 * prompt contexts. TriggerPrompts owns event dispatch, actor assignments, and
 * chat-message delivery; definitions should only inspect the event through the
 * supplied services adapter.
 */
export class CombatTrigger {
  /**
   * @param {{id: string, label: string, description: string, defaultRangeSquares?: number}} definition
   *   Stable identifier and display metadata used by configuration and chat.
   */
  constructor(definition) {
    Object.assign(this, definition);
  }

  /**
   * Returns the actor-specific prompts for a combat event.
   *
   * Returning an empty array means the event does not qualify. Each returned
   * context identifies the actor that may receive a prompt and supplies the
   * text shown to that actor.
   *
   * @param {object} event
   *   One of the dispatcher event shapes identified by `event.type`.
   * @param {object} services
   *   Foundry-derived token, combatant, relationship, and distance helpers.
   * @returns {Array<{actor: Actor, sourceName: string, detail: string}>}
   */
  evaluate(event, services) {
    return [];
  }
}
