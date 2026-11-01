/**
 * Stable trigger identifiers persisted in actor and item configuration and in
 * prompt flags.
 *
 * Do not change an existing value without a migration: worlds store these IDs
 * in document flags.
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

/** Actions exposed by a private trigger-prompt chat card's data attributes. */
export const TRIGGER_PROMPT_ACTION = Object.freeze({
  USE: "use",
  DISMISS: "dismiss",
});

/** Flag namespace used on private prompt chat messages. */
export const TRIGGER_PROMPT_FLAG = "triggerPrompts";
/**
 * Flag key under the module scope for persistent trigger configuration. Actors
 * store their actor-level options under it; powers store their assignments.
 */
export const TRIGGER_CONFIGURATION_FLAG = "trigger-prompts";
/** Time for which a recipient may select one power from a prompt. */
export const TRIGGER_PROMPT_TIMEOUT_MS = 10_000;

/**
 * SocketLib handler names used by the trigger-prompt submodule.
 *
 * Events are evaluated on the client that caused them, so no evaluation
 * message crosses the socket. The two remaining handlers run on the prompt's
 * author, who keeps the prompt message and is the only client (besides a GM)
 * Foundry lets modify it.
 */
export const TRIGGER_SOCKET_ACTION = Object.freeze({
  CLAIM_PROMPT: "claimTriggerPrompt",
  DISMISS_PROMPT: "dismissTriggerPrompt",
});

/**
 * Legacy virtual power selections understood during configuration migration.
 *
 * Current configuration stores a concrete assignment for each selected power.
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
  PROMPT_HIDDEN_CLASS: "trigger-prompts-message--hidden",
  DISMISS_LABEL: "Ignore",
});
