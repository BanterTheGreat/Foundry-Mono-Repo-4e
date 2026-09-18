import { MODULE_NAME } from "../../shared/globals.js";
import { ABILITY_SELECTION, TRIGGER_CONFIGURATION_FLAG, TRIGGER_ID, TRIGGER_PROMPT_UI } from "./constants.js";
import { TRIGGERS } from "./trigger-registry.js";

/**
 * Persists and resolves an actor's trigger-prompt configuration.
 *
 * Configured assignments live on the actor, rather than on the power, because
 * they describe when an actor may use a power. This class also understands the
 * legacy selector-based configuration and presents the actor and power dialogs
 * used to edit the current assignment-based form.
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
   * @param {object} [context={}]
   *   Event data supplied by the trigger, including optional distance data.
   * @returns {Array<object>}
   *   Eligible power assignments, or a no-power sentinel for actor-level prompts.
   */
  static eligibleAssignmentsFor(actor, trigger, triggerEvent = {}) {
    if (trigger.actorLevel) {
      return ActorTriggerConfiguration.isActorLevelPromptEnabled(actor, trigger) ? [{}] : [];
    }
    if (trigger.id === TRIGGER_ID.OPPORTUNITY_ATTACK) {
      if (!ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(actor)) {
        return [];
      }
      return actor.items.filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item) && ActorTriggerConfiguration.#hasAvailableUses(item))
        .map(item => ({ id: `opportunity:${item.id}`, itemId: item.id, triggerId: trigger.id, parameters: {}, item }));
    }
    return ActorTriggerConfiguration.configuredAssignments(actor)
      .filter(assignment => assignment.triggerId === trigger.id)
      .filter(assignment => ActorTriggerConfiguration.#hasAvailableUses(assignment.item))
      .filter(assignment => ActorTriggerConfiguration.#isAssignmentEligibleForEvent(assignment, trigger, triggerEvent));
  }

  /**
   * Reads all persisted trigger assignments whose referenced power still exists.
   *
   * @param {Actor} actor
   *   Actor whose configured powers should be resolved.
   * @returns {Array<object>}
   *   Persisted assignment data enriched with its current `item` document.
   */
  static configuredAssignments(actor) {
    return ActorTriggerConfiguration.#readConfiguration(actor).assignments
      .map(assignment => ({ ...assignment, item: actor.items.get(assignment.itemId) }))
      .filter(assignment => assignment.item?.type === "power");
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
   * Opens the actor-level trigger-prompt configuration dialog.
   *
   * This dialog only controls automatic opportunity prompts and summarizes
   * assignments. Individual power assignments are edited from each power's
   * configuration dialog.
   *
   * @param {Actor} actor
   *   Actor whose trigger-prompt settings will be displayed and saved.
   */
  static showActorDialog(actor) {
    const checked = ActorTriggerConfiguration.isOpportunityAttackPromptEnabled(actor) ? "checked" : "";
    const opportunityPowers = actor.items.filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item));
    const opportunitySummary = opportunityPowers.length
      ? `<ul>${opportunityPowers.map(item => `<li>${foundry.utils.escapeHTML(item.name)}</li>`).join("")}</ul>`
      : `<p class="hint">No powers are marked as opportunity attacks.</p>`;
    const actorLevelRows = TRIGGERS.filter(trigger => trigger.actorLevel)
      .map(trigger => ActorTriggerConfiguration.#renderActorLevelRow(actor, trigger)).join("");
    const summary = TRIGGERS.filter(trigger => trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK)
      .map(trigger => ActorTriggerConfiguration.#renderTriggerSummary(actor, trigger)).filter(Boolean).join("");
    const content = `<form class="${TRIGGER_PROMPT_UI.CONFIG_CLASS}">
      <section class="trigger-prompts-config__row">
        <div class="trigger-prompts-config__details"><strong>Opportunity Attacks</strong><p class="hint">Offer every power marked by DnD4e as an opportunity attack, plus Basic Attacks for NPCs.</p>${opportunitySummary}</div>
        <label><input type="checkbox" name="opportunityAttack.enabled" ${checked}> Enabled</label>
      </section>
      ${actorLevelRows}
      <h3>Power trigger assignments</h3>
      <div class="trigger-prompts-config__summary">${summary || `<p class="hint">No powers have trigger assignments.</p>`}</div>
    </form>`;
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
   * Opens the per-power dialog for assigning trigger prompts.
   *
   * @param {Item} item
   *   Actor-owned DnD4e power whose assignments will be edited.
   */
  static showPowerDialog(item) {
    const actor = item.parent;
    if (!actor || actor.documentName !== "Actor" || item.type !== "power") {
      return;
    }
    const assignments = new Map(ActorTriggerConfiguration.configuredAssignments(actor)
      .filter(assignment => assignment.itemId === item.id).map(assignment => [assignment.triggerId, assignment]));
    const rows = TRIGGERS.filter(trigger => trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK && !trigger.actorLevel)
      .map(trigger => ActorTriggerConfiguration.#renderAssignmentRow(trigger, assignments.get(trigger.id))).join("");
    const triggerText = ActorTriggerConfiguration.getPowerTriggerText(item);
    const reference = triggerText
      ? `<p class="trigger-prompts-config__reference"><strong>Power trigger:</strong> ${foundry.utils.escapeHTML(triggerText)}</p>`
      : `<p class="hint">This power has no trigger line in its DnD4e data.</p>`;
    new foundry.applications.api.DialogV2({
      window: { title: `${item.name}: Trigger prompts` },
      content: `<form class="${TRIGGER_PROMPT_UI.CONFIG_CLASS}">${reference}${rows}</form>`,
      position: { width: 640 },
      buttons: [{
        action: "save",
        label: "Save",
        default: true,
        callback: (event, button, dialog) => ActorTriggerConfiguration.#replacePowerAssignments(item, dialog.element.querySelector("form")),
      }],
    }).render({ force: true });
  }

  /**
   * Returns the DnD4e trigger text recorded on a power, if available.
   *
   * @param {Item} item
   *   Power whose system trigger field should be read.
   * @returns {string}
   *   Human-readable trigger text, or an empty string when it is absent.
   */
  static getPowerTriggerText(item) {
    const trigger = item.system?.trigger;
    return typeof trigger === "string" ? trigger : trigger?.value ?? trigger?.text ?? "";
  }

  /**
   * Removes every persisted assignment that references a deleted power.
   *
   * @param {Item} item
   *   Deleted actor-owned power.
   * @returns {Promise<void>}
   */
  static async removeAssignmentsForItem(item) {
    const actor = item.parent;
    if (!actor || actor.documentName !== "Actor") {
      return;
    }
    const configuration = ActorTriggerConfiguration.#readConfiguration(actor);
    const assignments = configuration.assignments.filter(assignment => assignment.itemId !== item.id);
    if (assignments.length !== configuration.assignments.length) {
      await actor.setFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG, { ...configuration, assignments });
    }
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
      const triggerText = ActorTriggerConfiguration.getPowerTriggerText(assignment.item);
      return `<li><strong>${foundry.utils.escapeHTML(assignment.item.name)}</strong>${range}${triggerText ? `<small>${foundry.utils.escapeHTML(triggerText)}</small>` : ""}</li>`;
    }).join("");
    return `<section><h4>${foundry.utils.escapeHTML(trigger.label)}</h4><ul>${rows}</ul></section>`;
  }

  /**
   * Renders one assignable trigger row in the power-dialog form.
   *
   * @param {object} trigger
   * @param {object} [assignment]
   * @returns {string}
   */
  static #renderAssignmentRow(trigger, assignment) {
    const checked = assignment ? "checked" : "";
    const range = trigger.defaultRangeSquares === undefined ? "" : `<label class="trigger-prompts-config__range">Range <input type="number" name="${trigger.id}.rangeSquares" min="0" step="1" value="${assignment?.parameters?.rangeSquares ?? trigger.defaultRangeSquares}"> squares</label>`;
    return `<section class="trigger-prompts-config__row">
      <div class="trigger-prompts-config__details"><strong>${foundry.utils.escapeHTML(trigger.label)}</strong><p class="hint">${foundry.utils.escapeHTML(trigger.description)}</p></div>
      <div class="trigger-prompts-config__controls"><label><input type="checkbox" name="${trigger.id}.enabled" ${checked}> Assigned</label>${range}</div>
    </section>`;
  }

  /**
   * Saves the actor-level opportunity-prompt option.
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
      opportunityAttack: { enabled: data.has("opportunityAttack.enabled") },
      actorLevelTriggers,
    });
  }

  /**
   * Replaces the edited power's trigger assignments with the submitted values.
   *
   * Assignments for all other powers are retained unchanged.
   *
   * @param {Item} item
   * @param {HTMLFormElement} form
   * @returns {Promise<void>}
   */
  static async #replacePowerAssignments(item, form) {
    const actor = item.parent;
    const configuration = ActorTriggerConfiguration.#readConfiguration(actor);
    const existing = new Map(configuration.assignments.filter(assignment => assignment.itemId === item.id).map(assignment => [assignment.triggerId, assignment]));
    const data = new FormData(form);
    const itemAssignments = TRIGGERS
      .filter(trigger => trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK && !trigger.actorLevel && data.has(`${trigger.id}.enabled`))
      .map(trigger => {
        const range = data.get(`${trigger.id}.rangeSquares`);
        const parsedRange = Number(range);
        return {
          id: existing.get(trigger.id)?.id ?? foundry.utils.randomID(), itemId: item.id, triggerId: trigger.id,
          parameters: trigger.defaultRangeSquares === undefined ? {} : { rangeSquares: range === "" || !Number.isFinite(parsedRange) ? trigger.defaultRangeSquares : Math.max(0, parsedRange) },
        };
      });
    await actor.setFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG, {
      ...configuration,
      assignments: [...configuration.assignments.filter(assignment => assignment.itemId !== item.id), ...itemAssignments],
    });
  }

  /**
   * Checks whether an assignment's optional range permits a prompt.
   *
   * @param {object} assignment
   * @param {object} trigger
   * @param {object} context
   * @returns {boolean}
   */
  static #isAssignmentEligibleForEvent(assignment, trigger, triggerEvent) {
    if (trigger.defaultRangeSquares === undefined || !Number.isFinite(triggerEvent.distanceSquares)) {
      return true;
    }
    const range = assignment.parameters?.rangeSquares;
    return triggerEvent.distanceSquares <= (Number.isFinite(range) && range >= 0 ? range : trigger.defaultRangeSquares);
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
   * Reads the current assignment format or converts legacy selector data into
   * the current in-memory configuration shape.
   *
   * Legacy data is deliberately not written during reads; the next explicit
   * configuration save persists the current format.
   *
   * @param {Actor} actor
   * @returns {{opportunityAttack: {enabled: boolean}, actorLevelTriggers: object, assignments: Array<object>}}
   */
  static #readConfiguration(actor) {
    const stored = actor.getFlag(MODULE_NAME, TRIGGER_CONFIGURATION_FLAG) ?? {};
    if (Array.isArray(stored.assignments)) {
      return {
        opportunityAttack: { enabled: stored.opportunityAttack?.enabled !== false },
        actorLevelTriggers: stored.actorLevelTriggers ?? {},
        assignments: stored.assignments,
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
        items = actor.items.filter(item => item.type === "power" && item.system?.attack?.isBasic);
      } else if (selection === ABILITY_SELECTION.OPPORTUNITY_ATTACKS) {
        items = actor.items.filter(item => ActorTriggerConfiguration.#isOpportunityAttackPower(actor, item));
      } else {
        const itemId = selection?.startsWith(ABILITY_SELECTION.ITEM_PREFIX) ? selection.slice(ABILITY_SELECTION.ITEM_PREFIX.length) : selection;
        const item = actor.items.get(itemId);
        items = item?.type === "power" ? [item] : [];
      }
      for (const item of items) {
        assignments.push({ id: foundry.utils.randomID(), itemId: item.id, triggerId: trigger.id, parameters: trigger.defaultRangeSquares === undefined ? {} : { rangeSquares: entry.rangeSquares ?? trigger.defaultRangeSquares } });
      }
    }
    return { opportunityAttack: { enabled: stored[TRIGGER_ID.OPPORTUNITY_ATTACK]?.enabled !== false }, actorLevelTriggers: {}, assignments };
  }
}
