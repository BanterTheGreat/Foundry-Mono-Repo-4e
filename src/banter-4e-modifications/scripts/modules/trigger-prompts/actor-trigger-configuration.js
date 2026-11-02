import { matchesTriggerFilters } from "./trigger-filters.js";
import { MODULE_NAME } from "../../shared/globals.js";
import { Logger } from "../../shared/logger.js";
import { ABILITY_SELECTION, TRIGGER_CONFIGURATION_FLAG, TRIGGER_ID, TRIGGER_PROMPT_UI } from "./constants.js";
import { ItemTriggerAssignments } from "./item-trigger-assignments.js";
import { TRIGGERS } from "./trigger-definitions.js";

/**
 * Resolves which powers an actor may offer for a trigger, and edits the
 * actor-level trigger options.
 *
 * Power assignments live on the powers themselves (see
 * {@link ItemTriggerAssignments}). The actor flag keeps only what is not tied
 * to one power: whether opportunity attacks are offered and which reminder
 * triggers are on. Worlds created before assignments moved to powers still
 * hold them in the actor flag; they are read as a fallback and moved onto the
 * powers by {@link ActorTriggerConfiguration.migrateLegacyAssignments}.
 */
export class ActorTriggerConfiguration {
  /**
   * Returns the configured powers an actor may use for one evaluated trigger.
   *
   * Opportunity attacks are a built-in actor-level option: eligible powers are
   * derived from DnD4e attack metadata rather than stored as assignments. All
   * other triggers use persisted assignments and may apply event-specific
   * constraints, such as the configured range.
   *
   * @param {Actor} actor
   *   Actor receiving a possible prompt.
   * @param {object} trigger
   *   Trigger definition being evaluated.
   * @param {object} [promptContext={}]
   *   Prompt context produced by the evaluator, including optional distance data.
   * @returns {Array<object>}
   *   Eligible power assignments, or a no-power sentinel for actor-level prompts.
   */
  static eligibleAssignmentsFor(actor, trigger, promptContext = {}) {
    if (trigger.actorLevel) {
      return ActorTriggerConfiguration.isActorLevelPromptEnabled(actor, trigger) ? [{}] : [];
    }
    if (trigger.id === TRIGGER_ID.OPPORTUNITY_ATTACK) {
      if (!ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(actor)) {
        return [];
      }
      return ActorTriggerConfiguration.#itemsOf(actor).filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item) && ActorTriggerConfiguration.#hasAvailableUses(item))
        .map(item => ({ id: `opportunity:${item.id}`, itemId: item.id, triggerId: trigger.id, parameters: {}, item }));
    }
    return ActorTriggerConfiguration.configuredAssignments(actor)
      .filter(assignment => assignment.triggerId === trigger.id)
      .filter(assignment => ActorTriggerConfiguration.#hasAvailableUses(assignment.item))
      .filter(assignment => ActorTriggerConfiguration.#isAssignmentEligibleForEvent(assignment, trigger, promptContext));
  }

  /**
   * Reads every trigger assignment on an actor's powers.
   *
   * A power saved with the current dialog is authoritative. A power that was
   * never saved falls back to assignments still held in the actor flag.
   *
   * @param {Actor} actor
   * @returns {Array<{id: string, itemId: string, triggerId: string, parameters: object, source: string, item: Item}>}
   *   Assignments enriched with their power document.
   */
  static configuredAssignments(actor) {
    const powers = ActorTriggerConfiguration.#itemsOf(actor).filter(item => ["power", "feat", "feature"].includes(item.type));
    const assignments = [];
    const configuredItemIds = new Set();
    for (const item of powers) {
      const stored = ItemTriggerAssignments.read(item);
      if (stored.configured) {
        configuredItemIds.add(item.id);
      }
      assignments.push(...stored.assignments.map(assignment => ({ ...assignment, id: `${item.id}:${assignment.triggerId}`, itemId: item.id, item })));
    }
    const itemsById = new Map(powers.map(item => [item.id, item]));
    for (const legacy of ActorTriggerConfiguration.#readConfiguration(actor).assignments) {
      const item = itemsById.get(legacy.itemId);
      if (item && !configuredItemIds.has(item.id)) {
        assignments.push({ id: `${item.id}:${legacy.triggerId}`, itemId: item.id, triggerId: legacy.triggerId, parameters: legacy.parameters ?? {}, source: "manual", item });
      }
    }
    return assignments;
  }

  /**
   * Reads the assignments for one power, including legacy ones not yet moved.
   *
   * @param {Item} item
   * @returns {Array<{triggerId: string, parameters: object, source: string}>}
   */
  static assignmentsForItem(item) {
    if (item.parent?.documentName !== "Actor") {
      return ItemTriggerAssignments.read(item).assignments;
    }
    return ActorTriggerConfiguration.configuredAssignments(item.parent).filter(assignment => assignment.itemId === item.id);
  }

  /**
   * Determines whether this actor should receive automatic opportunity prompts.
   *
   * @param {Actor} actor
   *   Actor whose actor-level option should be read.
   * @returns {boolean}
   *   Whether eligible opportunity-attack powers may be prompted.
   */
  static isOpportunityAttackPromptEnabled(actor) {
    return ActorTriggerConfiguration.#readConfiguration(actor).opportunityAttack.enabled;
  }

  /** Whether this actor automatically marks non-friendly attack targets. */
  static isCombatChallengeEnabled(actor) {
    return actor.getFlag?.(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG)?.classFeatures?.combatChallenge === true;
  }

  /**
   * Determines whether this actor should receive a no-power reminder prompt.
   *
   * @param {Actor} actor
   * @param {object} trigger
   * @returns {boolean}
   */
  static isActorLevelPromptEnabled(actor, trigger) {
    return ActorTriggerConfiguration.#readConfiguration(actor).actorLevelTriggers[trigger.id]?.enabled === true;
  }

  /**
   * Moves assignments held in an actor's flag onto the powers they name.
   *
   * A power that already has saved assignments keeps them; the stale actor
   * entries for it are dropped. Actor-level options are preserved.
   *
   * @param {Actor} actor
   * @returns {Promise<number>}
   *   Number of assignments written to powers.
   */
  static async migrateLegacyAssignments(actor) {
    const configuration = ActorTriggerConfiguration.#readConfiguration(actor);
    if (!configuration.assignments.length) {
      return 0;
    }
    const itemsById = new Map(ActorTriggerConfiguration.#itemsOf(actor).map(item => [item.id, item]));
    const byItem = new Map();
    for (const assignment of configuration.assignments) {
      const item = itemsById.get(assignment.itemId);
      if (item?.type === "power" && !ItemTriggerAssignments.read(item).configured) {
        byItem.set(item, [...(byItem.get(item) ?? []), { triggerId: assignment.triggerId, parameters: assignment.parameters ?? {}, source: "manual" }]);
      }
    }
    let migrated = 0;
    for (const [item, assignments] of byItem) {
      await ItemTriggerAssignments.write(item, assignments);
      migrated += assignments.length;
    }
    await actor.setFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG, { ...configuration, assignments: [] });
    return migrated;
  }

  /**
   * Migrates every world actor's legacy assignments. Meant for one GM client.
   *
   * @returns {Promise<void>}
   */
  static async migrateAllLegacyAssignments() {
    for (const actor of Array.from(game.actors.values())) {
      try {
        const migrated = await ActorTriggerConfiguration.migrateLegacyAssignments(actor);
        if (migrated) {
          Logger.info("Moved trigger assignments onto powers", { actorId: actor.id, migrated });
        }
      } catch (error) {
        Logger.error("Failed to move trigger assignments onto powers", { actorId: actor.id, error: error.message });
      }
    }
  }

  /**
   * Opens the actor-level trigger-prompt configuration dialog.
   *
   * This dialog only controls automatic opportunity prompts and actor-level
   * reminders, and summarizes assignments. Individual power assignments are
   * edited from each power's configuration dialog.
   *
   * @param {Actor} actor
   *   Actor whose trigger-prompt settings will be displayed and saved.
   */
  static showActorDialog(actor) {
    const checked = ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(actor) ? "checked" : "";
    const turnChecked = ActorTriggerConfiguration.#readConfiguration(actor).opportunityAttack.oncePerTurn !== false ? "checked" : "";
    const opportunityPowers = ActorTriggerConfiguration.#itemsOf(actor).filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item));
    const opportunitySummary = opportunityPowers.length
      ? `<ul>${opportunityPowers.map(item => `<li>${foundry.utils.escapeHTML(item.name)}</li>`).join("")}</ul>`
      : `<p class="hint">No powers are marked as opportunity attacks.</p>`;
    const actorLevelRows = TRIGGERS.filter(trigger => trigger.actorLevel)
      .map(trigger => ActorTriggerConfiguration.#renderActorLevelRow(actor, trigger)).join("");
    const summary = TRIGGERS.filter(trigger => trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK)
      .map(trigger => ActorTriggerConfiguration.#renderTriggerSummary(actor, trigger)).filter(Boolean).join("");
    // DialogV2 already wraps its content in a form; a nested <form> is dropped by the HTML parser.
    const content = `<div class="${TRIGGER_PROMPT_UI.CONFIG_CLASS} trigger-prompts-config--actor">
      <section class="trigger-prompts-config__row">
        <div class="trigger-prompts-config__details"><strong>Opportunity Attacks</strong><p class="hint">Offer every power marked by DnD4e as an opportunity attack, plus Basic Attacks for NPCs.</p>${opportunitySummary}</div>
        <label><input type="checkbox" name="opportunityAttack.enabled" ${checked}> Enabled</label>
        <label><input type="checkbox" name="opportunityAttack.oncePerTurn" ${turnChecked}> Once per turn</label>
        <p class="hint">One prompt per enemy per turn, including ignored prompts. Shift movement does not provoke.</p>
      </section>
      ${actorLevelRows}
      <h3>Class Features</h3>
      <section class="trigger-prompts-config__row">
        <div class="trigger-prompts-config__details"><strong>Combat Challenge</strong><p class="hint">Automatically mark every non-friendly creature you attack in combat, hit or miss, until the end of your next turn. Replaces an existing mark. Target Automation applies marks when attack results are confirmed. Requires a connected GM.</p></div>
        <label><input type="checkbox" name="classFeatures.combatChallenge" ${ActorTriggerConfiguration.isCombatChallengeEnabled(actor) ? "checked" : ""}> Enabled</label>
      </section>
      <h3>Power and feat trigger assignments</h3>
      <div class="trigger-prompts-config__summary">${summary || `<p class="hint">No powers or feats have trigger assignments.</p>`}</div>
    </div>`;
    new foundry.applications.api.DialogV2({
      window: { title: `${actor.name}: Trigger prompts` },
      content,
      position: { width: 640 },
      buttons: [{
        action: "save",
        label: "Save",
        default: true,
        callback: (event, button, dialog) => ActorTriggerConfiguration.#saveActorOptions(actor, dialog.element.querySelector("form")),
      }],
    }).render({ force: true });
  }

  /**
   * Renders the configured powers for one trigger in the actor-dialog summary.
   *
   * @param {Actor} actor
   * @param {object} trigger
   * @returns {string}
   *   Summary markup, or an empty string when no powers are assigned.
   */
  static #renderTriggerSummary(actor, trigger) {
    const assignments = ActorTriggerConfiguration.configuredAssignments(actor).filter(assignment => assignment.triggerId === trigger.id);
    if (!assignments.length) {
      return "";
    }
    const rows = assignments.map(assignment => {
      const rangeSquares = assignment.parameters?.rangeSquares ?? trigger.defaultRangeSquares;
      const range = trigger.defaultRangeSquares === undefined ? "" : ` — Range ${rangeSquares} squares`;
      const triggerText = ItemTriggerAssignments.getTriggerText(assignment.item);
      return `<li><strong>${foundry.utils.escapeHTML(assignment.item.name)}</strong>${range}${triggerText ? `<small>${foundry.utils.escapeHTML(triggerText)}</small>` : ""}</li>`;
    }).join("");
    return `<section><h4>${foundry.utils.escapeHTML(trigger.label)}</h4><ul>${rows}</ul></section>`;
  }

  /**
   * Saves the actor-level options.
   *
   * @param {Actor} actor
   * @param {HTMLFormElement} form
   * @returns {Promise<void>}
   */
  static async #saveActorOptions(actor, form) {
    const configuration = ActorTriggerConfiguration.#readConfiguration(actor);
    const data = new FormData(form);
    const actorLevelTriggers = {
      ...configuration.actorLevelTriggers,
      ...Object.fromEntries(TRIGGERS.filter(trigger => trigger.actorLevel)
        .map(trigger => [trigger.id, { enabled: data.has(`${trigger.id}.enabled`) }])),
    };
    await actor.setFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG, {
      ...configuration,
      opportunityAttack: { enabled: data.has("opportunityAttack.enabled"), oncePerTurn: data.has("opportunityAttack.oncePerTurn") },
      actorLevelTriggers,
      classFeatures: { ...actor.getFlag?.(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG)?.classFeatures,
        combatChallenge: data.has("classFeatures.combatChallenge") },
    });
  }

  /**
   * Checks whether an assignment's optional range permits a prompt.
   *
   * @param {object} assignment
   * @param {object} trigger
   * @param {object} promptContext
   * @returns {boolean}
   */
  static #isAssignmentEligibleForEvent(assignment, trigger, promptContext) {
    const parameters = assignment.parameters ?? {};
    if (!matchesTriggerFilters(parameters, promptContext)) {
      return false;
    }
    if (trigger.pathEntersRange && !promptContext.entersRange?.(parameters.rangeSquares ?? trigger.defaultRangeSquares)) {
      return false;
    }
    if (parameters.nonMinion && promptContext.isMinion !== false
      || parameters.meleeOnly && promptContext.isMelee !== true
      || parameters.adjacentOnly && promptContext.adjacent !== true) {
      return false;
    }
    if (trigger.defaultRangeSquares === undefined || !Number.isFinite(promptContext.distanceSquares)) {
      return true;
    }
    const range = assignment.parameters?.rangeSquares;
    return promptContext.distanceSquares <= (Number.isFinite(range) && range >= 0 ? range : trigger.defaultRangeSquares);
  }

  /**
   * Renders one actor-level, no-power trigger option in the actor dialog.
   *
   * @param {Actor} actor
   * @param {object} trigger
   * @returns {string}
   */
  static #renderActorLevelRow(actor, trigger) {
    const checked = ActorTriggerConfiguration.isActorLevelPromptEnabled(actor, trigger) ? "checked" : "";
    return `<section class="trigger-prompts-config__row">
      <div class="trigger-prompts-config__details"><strong>${foundry.utils.escapeHTML(trigger.label)}</strong><p class="hint">${foundry.utils.escapeHTML(trigger.description)}</p></div>
      <label><input type="checkbox" name="${trigger.id}.enabled" ${checked}> Enabled</label>
    </section>`;
  }

  /**
   * Lists an actor's items whether the collection is a Foundry Collection, a
   * Map, or an array.
   *
   * @param {Actor} actor
   * @returns {Item[]}
   */
  static #itemsOf(actor) {
    return Array.from(actor.items.values());
  }

  /**
   * Identifies powers DnD4e permits as opportunity attacks for this actor.
   *
   * Legacy DnD4e represents NPC opportunity attacks as Basic Attacks, so NPC
   * Basic Attacks are included alongside powers explicitly marked as opportunity
   * attacks.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @returns {boolean}
   */
  static #isOpportunityAttackPower(actor, item) {
    if (item.type !== "power") {
      return false;
    }
    return item.system?.attack?.isOpp
      || item.system?.attack?.canOpp
      || ActorTriggerConfiguration.#hasOpportunityAttackRollMode(item)
      || (actor.type === "NPC" && item.system?.attack?.isBasic);
  }

  /**
   * Determines whether one of a power's alternate roll modes is an
   * opportunity attack.
   *
   * Roll-mode data may be stored as an array or keyed object, depending on
   * the DnD4e data source that created the power.
   *
   * @param {Item} item
   *   Power whose alternate roll modes should be inspected.
   * @returns {boolean}
   *   Whether an alternate roll mode marks this power as an opportunity attack.
   */
  static #hasOpportunityAttackRollMode(item) {
    const rollModes = item.system?.rollModes;
    const modes = Array.isArray(rollModes) ? rollModes : Object.values(rollModes ?? {});
    return modes.some(mode => mode?.opportunityAttack === true);
  }

  /**
   * Determines whether a power with DnD4e limited uses still has at least one
   * use. A period alone is not limiting unless its prepared maximum is positive.
   *
   * @param {Item} item
   * @returns {boolean}
   *   Whether the power may be offered in a trigger prompt.
   */
  static #hasAvailableUses(item) {
    const uses = item.system?.uses;
    return !uses?.per || !(item.preparedMaxUses > 0) || Number(uses.value) > 0;
  }

  /**
   * Reads the actor flag: actor-level options plus any legacy assignments.
   *
   * Worlds from before assignment-based configuration stored one selector per
   * trigger; those are converted to assignments in memory. Nothing is written
   * during reads; {@link ActorTriggerConfiguration.migrateLegacyAssignments}
   * persists the current form.
   *
   * @param {Actor} actor
   * @returns {{opportunityAttack: {enabled: boolean}, actorLevelTriggers: object, assignments: Array<object>}}
   *   `assignments` holds only legacy, not-yet-migrated entries.
   */
  static #readConfiguration(actor) {
    const stored = actor.getFlag?.(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG) ?? {};
    if (Array.isArray(stored.assignments)) {
      return {
        opportunityAttack: { enabled: stored.opportunityAttack?.enabled ?? actor.type !== "NPC", oncePerTurn: stored.opportunityAttack?.oncePerTurn !== false },
        actorLevelTriggers: stored.actorLevelTriggers ?? {},
        assignments: stored.assignments,
        classFeatures: stored.classFeatures ?? {},
      };
    }
    const assignments = [];
    for (const trigger of TRIGGERS.filter(candidate => candidate.id !== TRIGGER_ID.OPPORTUNITY_ATTACK && !candidate.actorLevel)) {
      const entry = stored[trigger.id];
      if (!entry?.enabled) {
        continue;
      }
      const selection = entry.abilitySelection ?? entry.itemId;
      let items = [];
      if (selection === ABILITY_SELECTION.BASIC_ATTACKS) {
        items = ActorTriggerConfiguration.#itemsOf(actor).filter(item => item.type === "power" && item.system?.attack?.isBasic);
      } else if (selection === ABILITY_SELECTION.OPPORTUNITY_ATTACKS) {
        items = ActorTriggerConfiguration.#itemsOf(actor).filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item));
      } else {
        const itemId = selection?.startsWith(ABILITY_SELECTION.ITEM_PREFIX) ? selection.slice(ABILITY_SELECTION.ITEM_PREFIX.length) : selection;
        const item = ActorTriggerConfiguration.#itemsOf(actor).find(candidate => candidate.id === itemId);
        items = item?.type === "power" ? [item] : [];
      }
      for (const item of items) {
        assignments.push({ itemId: item.id, triggerId: trigger.id, parameters: trigger.defaultRangeSquares === undefined ? {} : { rangeSquares: entry.rangeSquares ?? trigger.defaultRangeSquares } });
      }
    }
    return { opportunityAttack: { enabled: stored[TRIGGER_ID.OPPORTUNITY_ATTACK]?.enabled ?? actor.type !== "NPC" }, actorLevelTriggers: {}, assignments, classFeatures: stored.classFeatures ?? {} };
  }
}
