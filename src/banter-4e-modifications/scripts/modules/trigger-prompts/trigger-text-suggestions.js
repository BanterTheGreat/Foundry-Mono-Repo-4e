import { TRIGGERS } from "./trigger-definitions.js";

/**
 * Wording that carries no extra condition. It is removed from the text left
 * over after a trigger's phrase is matched, so that only wording a trigger
 * genuinely does not enforce is reported. Order matters: the specific phrases
 * run before the generic ones.
 */
const NEUTRAL_WORDING = Object.freeze([
  /\b(?:with|by) an? (?:\w+'s )?attack\b/g,
  /\bby an? (?:enemy|creature)\b/g,
  /\b(?:an?|any|the|one|each) (?:enemy|creature|foe|attack|target)\b/g,
  /\b(?:an?|any|the)\b/g,
]);

/**
 * Converts a power's trigger text to lower-case plain text.
 *
 * Strips HTML, normalises apostrophes, drops a leading "Trigger:" label and
 * trailing punctuation, and collapses whitespace.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function normalizeTriggerText(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^trigger\s*:\s*/, "")
    .replace(/[.\s]+$/, "");
}

/**
 * Suggests which triggers a power's trigger text describes.
 *
 * This is a reading aid, not an automation: a suggestion has no effect until
 * the user enables suggestions for that power and saves. When several triggers
 * match, the most specific one wins (a definition's `text.supersedes`).
 *
 * Every suggestion reports the wording it did not account for, so a partial
 * match ("... or scores a critical hit") is visible rather than silent.
 *
 * @param {string|null|undefined} triggerText
 *   The power's own trigger line.
 * @returns {Array<{
 *   triggerId: string,
 *   label: string,
 *   matchedText: string,
 *   assignable: boolean,
 *   parameters: {rangeSquares?: number},
 *   uncheckedText: string[],
 * }>}
 *   Suggestions in registry order; `assignable` is false for actor-level
 *   reminders, which are configured on the actor instead of the power.
 */
export function suggestTriggersFromText(triggerText) {
  const text = normalizeTriggerText(triggerText);
  if (!text) {
    return [];
  }

  const matches = [];
  for (const trigger of TRIGGERS) {
    const match = findMatch(trigger.text?.patterns, text);
    if (match) {
      matches.push({ trigger, match });
    }
  }
  const supersededIds = new Set(matches.flatMap(({ trigger }) => trigger.text.supersedes ?? []));

  return matches
    .filter(({ trigger }) => !supersededIds.has(trigger.id))
    .map(({ trigger, match }) => {
      const range = trigger.defaultRangeSquares !== undefined ? trigger.text.rangePattern?.exec(text) : null;
      return {
        triggerId: trigger.id,
        label: trigger.label,
        matchedText: match[0],
        assignable: !trigger.actorLevel,
        parameters: range ? { rangeSquares: Number(range[1]) } : {},
        uncheckedText: findUncheckedText(trigger, text, match, range),
      };
    });
}

/**
 * Returns the first match of any of a definition's patterns.
 *
 * @param {RegExp[]|undefined} patterns
 * @param {string} text
 * @returns {RegExpExecArray|null}
 */
function findMatch(patterns, text) {
  for (const pattern of patterns ?? []) {
    const match = pattern.exec(text);
    if (match) {
      return match;
    }
  }
  return null;
}

/**
 * Lists the wording around a match that the trigger does not enforce.
 *
 * The matched phrase, a captured range, the wording the definition `covers`,
 * and neutral filler are removed from each side to decide whether anything
 * is left. A side with something left is reported in the power's own words.
 *
 * @param {object} trigger
 * @param {string} text
 * @param {RegExpExecArray} match
 * @param {RegExpExecArray|null} range
 * @returns {string[]}
 */
function findUncheckedText(trigger, text, match, range) {
  const segments = [text.slice(0, match.index), text.slice(match.index + match[0].length)];
  const removals = [...(trigger.text.covers ?? []), ...(range ? [new RegExp(range[0].replace(/\d+/, "\\d+"))] : [])];
  return segments
    .filter(segment => {
      let remainder = segment;
      for (const removal of [...removals, ...NEUTRAL_WORDING]) {
        remainder = remainder.replace(removal.global ? removal : new RegExp(removal.source, `${removal.flags}g`), " ");
      }
      return remainder.replace(/[\s,;:.]+/g, "") !== "";
    })
    .map(segment => trimNeutralEdges(segment).replace(/\s+/g, " ").replace(/^[\s,;:.]+|[\s,;:.]+$/g, ""));
}

/**
 * Removes neutral phrases from the start and end of a leftover segment, so
 * "with an attack while raging" is reported as "while raging". Wording in the
 * middle is kept, since removing it would garble the power's own sentence.
 *
 * @param {string} segment
 * @returns {string}
 */
function trimNeutralEdges(segment) {
  const phrases = NEUTRAL_WORDING.slice(0, 3).map(phrase => phrase.source);
  const edges = phrases.flatMap(source => [new RegExp(`^[\\s,;:.]*(?:${source})`), new RegExp(`(?:${source})[\\s,;:.]*$`)]);
  let trimmed = segment;
  let previous;
  do {
    previous = trimmed;
    for (const edge of edges) {
      trimmed = trimmed.replace(edge, "");
    }
  } while (trimmed !== previous);
  return trimmed;
}
