/**
 * Stable trigger identifiers persisted in actor and item configuration and in
 * prompt flags.
 *
 * Do not change an existing value without a migration: worlds store these IDs
 * in document flags.
 */
export const TRIGGER_ID = Object.freeze({
  YOU_HIT_ENEMY: "you-hit-enemy",
  YOU_HIT_WITH_OPPORTUNITY_ATTACK: "you-hit-with-opportunity-attack",
  MARKED_ENEMY_ATTACKS_OTHER: "marked-enemy-attacks-other",
  ENEMY_ENTERS_RANGE: "enemy-enters-range",
  YOU_TAKE_DAMAGE: "you-take-damage",
  YOU_MAKE_SAVING_THROW: "you-make-saving-throw",
  YOU_OR_ALLY_FAILS_SAVE: "you-or-ally-fails-save",
  RANGED_AC_REFLEX_HITS_YOU: "ranged-ac-reflex-hits-you",
  COMPANION_TARGETED: "companion-targeted",
  COMPANION_HIT: "companion-hit",
  YOU_BLOODY_ENEMY: "you-bloody-enemy",
  ALLY_REDUCED_TO_ZERO: "ally-reduced-to-zero",
  OPPORTUNITY_ATTACK: "opportunity-attack",
  ENEMY_MISSES_YOU: "enemy-misses-you",
  ENEMY_MISSES_ALLY: "enemy-misses-ally",
  ENEMY_HITS_YOU: "enemy-hits-you",
  ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU: "attack-against-ac-or-reflex-misses-you",
  YOU_MISS: "you-miss",
  MARKED_ENEMY_HITS_ALLY: "marked-enemy-hits-ally",
  MARKED_CREATURE_BLOODIED: "marked-creature-bloodied",
  YOU_BECOME_BLOODIED: "you-become-bloodied",
  YOU_REDUCE_ENEMY_TO_ZERO: "you-reduce-enemy-to-zero",
  ADJACENT_ENEMY_REDUCED_TO_ZERO: "adjacent-enemy-reduced-to-zero",
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
export const TRIGGER_PROMPT_TIMEOUT_MS = 25_000;

/**
 * SocketLib handler names used by the trigger-prompt submodule.
 *
 * Events are evaluated on the client that caused them, so no evaluation
 * message crosses the socket. Prompt mutations run on their author. Shared item
 * allowances run on the active GM, or a stable online actor owner without a GM.
 */
export const TRIGGER_SOCKET_ACTION = Object.freeze({
  ITEM_LIMIT: "triggerItemLimit",
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
