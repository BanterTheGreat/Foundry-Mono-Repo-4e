/**
 * Stable trigger identifiers persisted in actor configuration and prompt flags.
 *
 * Do not change an existing value without a migration: worlds store these IDs
 * in actor flags.
 */
export const TRIGGER_ID = Object.freeze({
  OPPORTUNITY_ATTACK: "opportunity-attack",
  ENEMY_MISSES_YOU: "enemy-misses-you",
  ENEMY_MISSES_ALLY: "enemy-misses-ally",
  ENEMY_HITS_YOU: "enemy-hits-you",
  ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU: "attack-against-ac-or-reflex-misses-you",
  YOU_MISS: "you-miss",
  MARKED_ENEMY_HITS_ALLY: "marked-enemy-hits-ally",
  MARKED_CREATURE_BLOODIED: "marked-creature-bloodied",
  YOU_BECOME_BLOODIED: "you-become-bloodied",
  YOU_ARE_HIT_BY_MELEE_ATTACK: "you-are-hit-by-melee-attack",
  MARKED_CREATURE_SHIFTS_ADJACENT: "marked-creature-moves-adjacent",
  FAILS_SAVING_THROW: "fails-saving-throw",
});

/**
 * Event categories emitted by the dispatcher and consumed by trigger
 * definitions. Each category has a different event-data shape.
 */
export const TRIGGER_EVENT_TYPE = Object.freeze({
  MOVEMENT: "movement",
  ATTACK_RESULT: "attack-result",
  BLOODIED: "bloodied",
  SAVING_THROW_RESULT: "saving-throw-result",
});

/** Actions exposed by a private trigger-prompt chat card's data attributes. */
export const TRIGGER_PROMPT_ACTION = Object.freeze({
  USE: "use",
  DISMISS: "dismiss",
});

/** Flag namespace used on private prompt chat messages. */
export const TRIGGER_PROMPT_FLAG = "triggerPrompts";
/** Flag namespace used on actors for persistent trigger configuration. */
export const TRIGGER_CONFIGURATION_FLAG = "trigger-prompts";
/** Time for which a recipient may select one power from a prompt. */
export const TRIGGER_PROMPT_TIMEOUT_MS = 10_000;

/**
 * SocketLib handler names used by the trigger-prompt submodule.
 *
 * Evaluation and mutable chat-message operations are routed through a GM so
 * the authoritative client creates, claims, and expires prompts.
 */
export const TRIGGER_SOCKET_ACTION = Object.freeze({
  EVALUATE_ATTACK: "evaluateTriggerAttack",
  EVALUATE_SAVING_THROW: "evaluateTriggerSavingThrow",
  CLAIM_PROMPT: "claimTriggerPrompt",
  EXPIRE_PROMPT: "expireTriggerPrompt",
});

/**
 * Legacy virtual power selections understood during configuration migration.
 *
 * New configuration stores a concrete assignment for each selected power.
 */
export const ABILITY_SELECTION = Object.freeze({
  BASIC_ATTACKS: "basic-attacks",
  OPPORTUNITY_ATTACKS: "opportunity-attacks",
  ITEM_PREFIX: "item:",
});

/** DOM hooks and user-facing labels rendered by Trigger Prompt dialogs/cards. */
export const TRIGGER_PROMPT_UI = Object.freeze({
  CONFIG_CLASS: "trigger-prompts-config",
  CONFIG_ACTION: "configure-trigger-prompts",
  ITEM_CONFIG_CLASS: "trigger-prompts-item-config",
  ITEM_CONFIG_ACTION: "configure-item-trigger-prompts",
  PROMPT_ACTIONS_CLASS: "trigger-prompts-message__actions",
  DISMISS_LABEL: "Ignore",
});
