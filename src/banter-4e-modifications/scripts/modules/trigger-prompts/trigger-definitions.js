import { COMBAT_EVENT_TYPE } from "./combat-events.js";
import { TRIGGER_ID } from "./constants.js";

/**
 * Declarative trigger definitions.
 *
 * A definition is plain data read by `trigger-evaluator.js`; adding a trigger
 * means adding an entry here, not writing a class or touching the dispatcher.
 *
 * Fields:
 * - `id`, `label`, `description`: stable ID and display text.
 * - `on`: the {@link COMBAT_EVENT_TYPE} the trigger listens for.
 * - `where`: event fields that must match. A value is compared with `===`; an
 *   array matches any of its entries.
 * - `recipients`: who may be prompted. `{role}` is a token the event names,
 *   `{markOwnerOf}` is the creature that marked a role's token, and
 *   `{combatants: true, exclude: [roles]}` is every other combatant on the scene.
 * - `relations`: `{left, relation, right}` checks between role names (and
 *   `recipient`), where `relation` is `hostile`, `allied`, or `distinct`.
 * - `pathAdjacent`: `{mover, to}`; the mover's path starts or passes adjacent to `to`.
 * - `source` / `detail`: the role named in the prompt's source line and the
 *   prompt text. `{role}` placeholders become token names and `{defense}` the
 *   attacked defense.
 * - `actorLevel`: a reminder configured on the actor rather than on a power.
 * - `defaultRangeSquares` / `rangeBetween`: an optional per-assignment range,
 *   measured between the two named roles.
 * - `text`: how the trigger is recognised in a power's own trigger text, used
 *   for suggestions only. `patterns` match the normalised text, `rangePattern`
 *   captures a distance, `supersedes` lists less specific triggers this one
 *   replaces, and `covers` lists wording the trigger already enforces, so it
 *   is not reported as unchecked.
 *
 * Registry order is the order prompts are evaluated and delivered.
 */

/** Phrases for a creature that the configured actor has marked. */
const MARKED_CREATURE = "(?:enemy|creature) (?:that is )?marked by you|(?:enemy|creature) you(?:'ve| have) marked";

/**
 * Freezes a definition so shared data cannot be mutated by accident.
 *
 * @param {object} definition
 * @returns {object}
 */
function define(definition) {
  return Object.freeze(definition);
}

/** @type {ReadonlyArray<object>} */
export const TRIGGERS = Object.freeze([
  define({
    id: TRIGGER_ID.OPPORTUNITY_ATTACK,
    label: "Possible opportunity attack",
    description: "A hostile combatant's movement starts or passes adjacent to this actor; ending adjacent alone does not qualify.",
    on: COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED,
    recipients: { combatants: true, exclude: ["mover"] },
    relations: [{ left: "mover", relation: "hostile", right: "recipient" }],
    pathAdjacent: { mover: "mover", to: "recipient" },
    source: "mover",
    detail: "{mover} moved adjacent to {recipient}.",
  }),
  define({
    id: TRIGGER_ID.ENEMY_MISSES_YOU,
    label: "Enemy misses you",
    description: "An enemy misses this actor.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "miss" },
    recipients: { role: "target" },
    relations: [{ left: "attacker", relation: "hostile", right: "target" }],
    source: "attacker",
    detail: "{attacker} missed {target}.",
    text: {
      patterns: [
        /(?<!hits or )\bmisses you\b/,
        /\byou(?:'re| are) missed by an? (?:(?!melee\b|ranged\b|close\b|area\b)\w+ )?attack\b/,
        // An attack kind is left outside the match so it is reported as unchecked.
        /\byou(?:'re| are) missed by an?(?= (?:melee|ranged|close|area)\b)/,
      ],
    },
  }),
  define({
    id: TRIGGER_ID.ENEMY_MISSES_ALLY,
    label: "Enemy misses you or an ally",
    description: "An enemy misses this actor or an allied combatant within the configured range.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "miss" },
    recipients: { combatants: true },
    relations: [
      { left: "attacker", relation: "hostile", right: "target" },
      { left: "recipient", relation: "allied", right: "target" },
    ],
    defaultRangeSquares: 10,
    rangeBetween: ["recipient", "target"],
    source: "attacker",
    detail: "{attacker} missed {target}.",
    text: {
      patterns: [/\bmisses (?:you or )?(?:an |one of your |your )allies\b/, /\bmisses (?:you or )?(?:an |your )ally\b/],
      rangePattern: /\bally within (\d+) squares? of you\b/,
      supersedes: [TRIGGER_ID.ENEMY_MISSES_YOU],
    },
  }),
  define({
    id: TRIGGER_ID.ENEMY_HITS_YOU,
    label: "Enemy hits you",
    description: "An enemy within the configured range hits this actor.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "hit" },
    recipients: { role: "target" },
    relations: [{ left: "attacker", relation: "hostile", right: "target" }],
    defaultRangeSquares: 10,
    rangeBetween: ["recipient", "attacker"],
    source: "attacker",
    detail: "{attacker} hit {target}.",
    text: {
      patterns: [
        /(?<!\bor )\bhits you\b/,
        /\byou(?:'re| are) hit by an? (?:(?!melee\b|ranged\b|close\b|area\b)\w+ )?attack\b/,
        // An attack kind is left outside the match so it is reported as unchecked.
        /\byou(?:'re| are) hit by an?(?= (?:melee|ranged|close|area)\b)/,
      ],
      rangePattern: /\benemy within (\d+) squares? of you\b/,
    },
  }),
  define({
    id: TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU,
    label: "An attack against AC or Reflex misses you",
    description: "An enemy misses this actor with an attack against AC or Reflex.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "miss", defenseType: ["ac", "ref"] },
    recipients: { role: "target" },
    relations: [{ left: "attacker", relation: "hostile", right: "target" }],
    source: "attacker",
    detail: "{attacker} missed {target}'s {defense}.",
    text: {
      patterns: [
        /\bmisses you\b[^,]*\b(?:against|vs\.?|targeting)\b[^,]*\b(?:ac|reflex)\b/,
        /\b(?:against|vs\.?|targeting)\b[^,]*\b(?:ac|reflex)\b[^,]*\bmisses you\b/,
        /\bmisses your (?:ac|reflex)\b/,
      ],
      supersedes: [TRIGGER_ID.ENEMY_MISSES_YOU],
    },
  }),
  define({
    id: TRIGGER_ID.YOU_MISS,
    label: "You miss",
    description: "This actor misses an enemy with an attack.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "miss" },
    recipients: { role: "attacker" },
    relations: [{ left: "attacker", relation: "hostile", right: "target" }],
    source: "target",
    detail: "{attacker} missed {target}.",
    text: { patterns: [/\byou miss\b/] },
  }),
  define({
    id: TRIGGER_ID.MARKED_ENEMY_HITS_ALLY,
    label: "A creature you have marked hit an ally",
    description: "Show a reminder when a creature marked by this actor hits one of its allies.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "hit" },
    actorLevel: true,
    recipients: { markOwnerOf: "attacker" },
    relations: [
      { left: "attacker", relation: "hostile", right: "target" },
      { left: "recipient", relation: "allied", right: "target" },
      { left: "recipient", relation: "distinct", right: "target" },
    ],
    source: "attacker",
    detail: "{attacker}, marked by {recipient}, hit {target}.",
    text: { patterns: [new RegExp(`(?:${MARKED_CREATURE})[^,]*\\bhits\\b[^,]*\\ball(?:y|ies)\\b`)] },
  }),
  define({
    id: TRIGGER_ID.MARKED_CREATURE_BLOODIED,
    label: "Creature marked by you becomes bloodied",
    description: "A creature marked by this actor becomes bloodied.",
    on: COMBAT_EVENT_TYPE.HP_CHANGED,
    where: { becameBloodied: true },
    recipients: { markOwnerOf: "subject" },
    source: "subject",
    detail: "{subject}, marked by {recipient}, became bloodied.",
    text: { patterns: [new RegExp(`(?:${MARKED_CREATURE})[^,]*\\b(?:is|becomes|are) (?:first )?bloodied\\b`)] },
  }),
  define({
    id: TRIGGER_ID.YOU_BECOME_BLOODIED,
    label: "You become bloodied",
    description: "This actor becomes bloodied.",
    on: COMBAT_EVENT_TYPE.HP_CHANGED,
    where: { becameBloodied: true },
    recipients: { role: "subject" },
    source: "subject",
    detail: "{subject} became bloodied.",
    text: { patterns: [/(?<!while )\byou(?:'re| are| become)(?: first)? bloodied\b/, /\bbloodies you\b/] },
  }),
  define({
    id: TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK,
    label: "You are hit by a melee attack",
    description: "An enemy hits this actor with a Weapon or Melee X attack.",
    on: COMBAT_EVENT_TYPE.ATTACK_RESOLVED,
    where: { outcome: "hit", isMelee: true },
    recipients: { role: "target" },
    relations: [{ left: "attacker", relation: "hostile", right: "target" }],
    source: "attacker",
    detail: "{attacker} hit {target} with a melee attack.",
    text: {
      patterns: [
        /\bhits you with an? (?:basic )?melee(?: weapon| basic)? attack\b/,
        /\byou(?:'re| are) hit by an? (?:basic )?melee(?: weapon| basic)? attack\b/,
        /\bmelee attack hits you\b/,
      ],
      supersedes: [TRIGGER_ID.ENEMY_HITS_YOU],
    },
  }),
  define({
    id: TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT,
    label: "Adjacent creature marked by you shifts",
    description: "A creature marked by this actor shifts while adjacent to the actor.",
    on: COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED,
    recipients: { markOwnerOf: "mover" },
    pathAdjacent: { mover: "mover", to: "recipient" },
    source: "mover",
    detail: "{mover}, marked by {recipient}, moved while adjacent.",
    text: { patterns: [new RegExp(`(?:${MARKED_CREATURE})[^,]*\\b(?:shifts?|moves?)\\b`)], covers: [/\badjacent\b/] },
  }),
  define({
    id: TRIGGER_ID.FAILS_SAVING_THROW,
    label: "Fails Saving Throw",
    description: "This actor fails a saving throw.",
    on: COMBAT_EVENT_TYPE.SAVE_RESOLVED,
    where: { outcome: "fail" },
    recipients: { role: "subject" },
    source: "subject",
    detail: "{subject} failed a saving throw.",
    text: { patterns: [/\byou fail (?:a|your|the) saving throw\b/] },
  }),
]);

/**
 * Looks up a trigger definition by its persisted identifier.
 *
 * @param {string} id
 *   Stable trigger identifier from {@link TRIGGER_ID}.
 * @returns {object|undefined}
 *   The definition, when the ID is supported.
 */
export function findTriggerById(id) {
  return TRIGGERS.find(trigger => trigger.id === id);
}

/**
 * Lists the definitions that listen for an event type, in delivery order.
 *
 * @param {string} eventType
 *   A {@link COMBAT_EVENT_TYPE} value.
 * @returns {object[]}
 */
export function findTriggersForEvent(eventType) {
  return TRIGGERS.filter(trigger => trigger.on === eventType);
}
