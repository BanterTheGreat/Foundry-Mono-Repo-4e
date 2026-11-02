import { ATTACK_TYPES, DEFENSE_TYPES, DAMAGE_TYPES } from "./trigger-filters.js";
import { TRIGGER_ID, TRIGGER_PROMPT_UI } from "./constants.js";
import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { ASSIGNMENT_SOURCE, ItemTriggerAssignments } from "./item-trigger-assignments.js";
import { TRIGGERS } from "./trigger-definitions.js";
import { suggestTriggersFromText } from "./trigger-text-suggestions.js";

/** Name of the checkbox that turns suggestions on for the power being edited. */
const SUGGEST_TOGGLE = "suggestFromText";

/**
 * The trigger-assignment dialog for powers and feats.
 *
 * A searchable catalog selects one trigger editor at a time. A power's own trigger text
 * can be read into suggestions, but only on request: the "Suggest" checkbox is
 * off every time the dialog opens, ticking it shows what was understood and
 * pre-ticks the matching rows, and nothing is stored until the user presses Save.
 */
export class PowerTriggerDialog {
  /**
   * Opens the dialog for a power.
   *
   * @param {Item} item
   *   DnD4e power or feat, owned by an actor or free-standing.
   */
  static show(item) {
    if (!["power", "feat", "feature"].includes(item.type)) {
      return;
    }
    const assignments = new Map(ActorTriggerConfiguration.assignmentsForItem(item).map(assignment => [assignment.triggerId, assignment]));
    const triggerText = ItemTriggerAssignments.getTriggerText(item);
    const suggestions = suggestTriggersFromText(triggerText);
    const rows = PowerTriggerDialog.assignableTriggers().map(trigger => PowerTriggerDialog.renderAssignmentRow(trigger, assignments.get(trigger.id))).join("");
    const catalog = PowerTriggerDialog.assignableTriggers().map(trigger => `<button type="button" class="trigger-prompts-picker__choice" data-trigger-id="${trigger.id}" data-trigger-category="${PowerTriggerDialog.triggerCategory(trigger)}" data-trigger-search="${foundry.utils.escapeHTML(`${trigger.label} ${trigger.description}`.toLowerCase())}" aria-pressed="false"><span data-assignment-marker aria-hidden="true"></span><span>${foundry.utils.escapeHTML(trigger.label)}</span><span class="sr-only" data-assignment-status></span></button>`).join("");
    const dialog = new foundry.applications.api.DialogV2({
      window: { title: `${item.name}: Trigger prompts` },
      // DialogV2 already wraps its content in a form; a nested <form> is dropped by the HTML parser.
      content: `<div class="${TRIGGER_PROMPT_UI.CONFIG_CLASS} trigger-prompts-picker">${item.type !== "power" ? "<p class=\"hint\">Optional feat triggers post the feat to chat when selected. Mandatory benefits are announced automatically when the checkbox below is enabled.</p>" : PowerTriggerDialog.renderSuggestionPanel(triggerText, suggestions)}<div class="trigger-prompts-picker__split"><aside class="trigger-prompts-picker__catalog" aria-label="Trigger catalog"><h2 class="trigger-prompts-picker__heading">Triggers</h2><label>Find a trigger <input type="search" class="trigger-prompts-config__search" placeholder="Search triggers"></label><label>Category <select class="trigger-prompts-picker__category">${["All", "Attacks", "HP & damage", "Saving throws", "Movement", "Companion"].map(category => `<option>${category}</option>`).join("")}</select></label><div class="trigger-prompts-picker__choices">${catalog}</div><p class="hint trigger-prompts-config__empty" hidden>No matching triggers.</p></aside><div class="trigger-prompts-picker__editor" aria-label="Trigger conditions"><h2 class="trigger-prompts-picker__heading">Selected trigger</h2>${rows}<p class="hint trigger-prompts-picker__no-selection" hidden>Search or choose a category to find a trigger.</p></div></div><p class="hint trigger-prompts-picker__count" aria-live="polite"></p>${PowerTriggerDialog.renderLimit(item)}</div>`,
      position: { width: 760 },
      buttons: [{
        action: "save",
        label: "Save",
        default: true,
        callback: (event, button, app) => {
          const data = new FormData(app.element.querySelector("form"));
          return ItemTriggerAssignments.write(item, PowerTriggerDialog.readAssignments(data), PowerTriggerDialog.readLimit(data), data.has("automaticBenefit"));
        },
      }],
    });
    dialog.addEventListener("render", () => {
      const form = dialog.element.querySelector("form");
      PowerTriggerDialog.bindPicker(form);
      PowerTriggerDialog.#bindSuggestionToggle(form, suggestions);
    });
    dialog.render({ force: true });
  }

  /** Group triggers by the event being configured; companion events have their own category. */
  static triggerCategory(trigger) {
    if (trigger.companion) {
      return "Companion";
    }
    if (trigger.on.startsWith("attack-")) {
      return "Attacks";
    }
    return { "hp-changed": "HP & damage", "save-resolved": "Saving throws", "movement-committed": "Movement" }[trigger.on];
  }

  /**
   * Select one editor while keeping every form control mounted for submission.
   * Search and categories affect navigation only, never stored assignment values.
   */
  static bindPicker(form) {
    const choices = Array.from(form.querySelectorAll("[data-trigger-id]"));
    const panels = Array.from(form.querySelectorAll("[data-trigger-panel]"));
    const search = form.querySelector(".trigger-prompts-config__search");
    const category = form.querySelector(".trigger-prompts-picker__category");
    let selected = choices.find(choice => form.elements[`${choice.dataset.triggerId}.enabled`].checked)?.dataset.triggerId ?? choices[0]?.dataset.triggerId;
    const refresh = () => {
      const query = search.value.trim().toLowerCase();
      let count = 0;
      for (const choice of choices) {
        const id = choice.dataset.triggerId;
        const assigned = form.elements[`${id}.enabled`].checked;
        count += Number(assigned);
        choice.hidden = !choice.dataset.triggerSearch.includes(query) || (category.value !== "All" && choice.dataset.triggerCategory !== category.value);
        choice.querySelector("[data-assignment-marker]").textContent = assigned ? "\u2713" : "";
        choice.querySelector("[data-assignment-status]").textContent = assigned ? "Assigned" : "Not assigned";
      }
      const visible = choices.filter(choice => !choice.hidden);
      if (!visible.some(choice => choice.dataset.triggerId === selected)) {
        selected = visible[0]?.dataset.triggerId;
      }
      for (const choice of choices) {
        choice.setAttribute("aria-pressed", String(choice.dataset.triggerId === selected));
      }
      for (const panel of panels) {
        const id = panel.dataset.triggerPanel;
        panel.hidden = id !== selected;
        panel.querySelector(".trigger-prompts-picker__conditions").hidden = !form.elements[`${id}.enabled`].checked;
        panel.querySelector(".trigger-prompts-config__badge").hidden = form.elements[`${id}.source`].value !== ASSIGNMENT_SOURCE.TEXT;
      }
      form.querySelector(".trigger-prompts-config__empty").hidden = visible.length > 0;
      form.querySelector(".trigger-prompts-picker__no-selection").hidden = visible.length > 0;
      form.querySelector(".trigger-prompts-picker__count").textContent = `${count} assigned trigger${count === 1 ? "" : "s"}`;
    };
    for (const choice of choices) {
      choice.addEventListener("click", () => {
        selected = choice.dataset.triggerId;
        refresh();
      });
    }
    search.addEventListener("input", refresh);
    category.addEventListener("change", refresh);
    form.addEventListener("change", refresh);
    refresh();
  }

  /**
   * Lists the triggers a power can be assigned to: everything except
   * opportunity attacks and actor-level reminders, which are configured on
   * the actor.
   *
   * @returns {object[]}
   */
  static assignableTriggers() {
    return TRIGGERS.filter(trigger => trigger.id !== TRIGGER_ID.OPPORTUNITY_ATTACK && !trigger.actorLevel);
  }

  /** Render the allowance shared by every assignment on this power or feat. */
  static renderLimit(item) {
    const current = ItemTriggerAssignments.limit(item);
    const options = [["none", "No shared limit"], ["turn", "Once per turn"], ["firstEncounter", "First time per encounter"], ["day", "Once per day (Extended Rest)"]];
    return `<section class="trigger-prompts-picker__settings" aria-label="Shared settings"><h2 class="trigger-prompts-picker__heading">Shared settings</h2><div class="trigger-prompts-picker__setting"><label><input type="checkbox" name="automaticBenefit"${ItemTriggerAssignments.automatic(item) ? " checked" : ""}> Automatic benefit (mandatory)</label><p class="hint">Posts the benefit publicly in chat and briefly notifies the player, without a Use or Ignore choice. This announces the benefit; it does not apply its effects.</p></div><div class="trigger-prompts-picker__setting"><label>Shared limit <select name="sharedLimit">${options.map(([value, label]) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`).join("")}</select></label><p class="hint">Applies across all assigned triggers. Automatic benefits spend their allowance when triggered. Optional turn/day limits are spent on selection. First time per encounter offers only the first qualifying event, even if ignored.</p></div></section>`;
  }

  /** Validate the submitted shared allowance. */
  static readLimit(data) {
    const value = data.get("sharedLimit");
    return ["turn", "firstEncounter", "day"].includes(value) ? value : "none";
  }

  /**
   * Renders one assignable trigger row.
   *
   * @param {object} trigger
   * @param {{parameters?: {rangeSquares?: number}, source?: string}} [assignment]
   *   The power's current assignment for this trigger, if any.
   * @returns {string}
   */
  static renderAssignmentRow(trigger, assignment) {
    const checked = assignment ? "checked" : "";
    const range = trigger.defaultRangeSquares === undefined
      ? ""
      : `<label class="trigger-prompts-config__range">Range <input type="number" name="${trigger.id}.rangeSquares" min="0" step="1" value="${assignment?.parameters?.rangeSquares ?? trigger.defaultRangeSquares}"> squares</label>`;
    const source = assignment?.source ?? ASSIGNMENT_SOURCE.MANUAL;
    const badge = `<span class="trigger-prompts-config__badge"${source === ASSIGNMENT_SOURCE.TEXT ? "" : " hidden"}>from trigger text</span>`;
    const filters = PowerTriggerDialog.renderFilters(trigger, assignment?.parameters ?? {});
    const restrictions = [["nonMinion", "Non-minions only"], ["meleeOnly", "Melee attacks only"], ["adjacentOnly", "Adjacent only"]]
      .map(([key, label]) => `<label><input type="checkbox" name="${trigger.id}.${key}"${assignment?.parameters?.[key] ? " checked" : ""}> ${label}</label>`).join("");
    return `<section class="trigger-prompts-picker__panel" data-trigger-panel="${trigger.id}" hidden>
      <div class="trigger-prompts-config__details"><h3>${foundry.utils.escapeHTML(trigger.label)}</h3>${badge}<p class="hint">${foundry.utils.escapeHTML(trigger.description)}</p></div>
      <label><input type="checkbox" name="${trigger.id}.enabled" ${checked}> Assigned to this power or feat</label>
      <div class="trigger-prompts-picker__conditions"${assignment ? "" : " hidden"}>${range}<div class="trigger-prompts-config__restrictions" role="group" aria-label="Restrictions on the triggering creature or attack">${restrictions}${filters}</div></div>
      <input type="hidden" name="${trigger.id}.source" value="${source}">
    </section>`;
  }

  /** Render shared filters and an explicit companion binding. */
  static renderFilters(trigger, parameters) {
    const escape = value => foundry.utils.escapeHTML(String(value));
    const group = (key, label, values) => `<fieldset><legend>${label} (any if none selected)</legend>${values.map(value => `<label><input type="checkbox" name="${trigger.id}.${key}" value="${value}"${parameters[key]?.includes(value) ? " checked" : ""}> ${value.toUpperCase()}</label>`).join("")}</fieldset>`;
    const attack = trigger.on.startsWith("attack-") || trigger.on === "hp-changed" ? group("attackTypes", "Attack type", ATTACK_TYPES) : "";
    const defense = trigger.on.startsWith("attack-") ? group("defenseTypes", "Attacked defense", DEFENSE_TYPES) : "";
    const damage = trigger.damageRequired ? group("damageTypes", "Damage type", DAMAGE_TYPES) : "";
    const actors = Array.from(globalThis.game?.actors?.values?.() ?? []);
    const selected = parameters.companionActorUuid ?? "";
    const options = actors.map(actor => [actor.uuid, actor.name]);
    if (selected && !options.some(([uuid]) => uuid === selected)) {
      options.push([selected, `Missing companion (${selected})`]);
    }
    const companion = trigger.companion ? `<label>Companion <select name="${trigger.id}.companionActorUuid"><option value="">Choose a companion</option>${options.map(([uuid, name]) => `<option value="${escape(uuid)}"${uuid === selected ? " selected" : ""}>${escape(name)}</option>`).join("")}</select></label>` : "";
    const critical = trigger.on === "attack-resolved" ? `<label><input type="checkbox" name="${trigger.id}.criticalOnly"${parameters.criticalOnly ? " checked" : ""}> Critical hit only</label>` : "";
    return attack + defense + damage + companion + critical;
  }

  /**
   * Renders the power's trigger text and the opt-in suggestion panel.
   *
   * @param {string} triggerText
   *   The power's own trigger line.
   * @param {ReturnType<typeof suggestTriggersFromText>} suggestions
   * @returns {string}
   */
  static renderSuggestionPanel(triggerText, suggestions) {
    if (!triggerText) {
      return `<p class="hint">This power has no trigger line in its DnD4e data.</p>`;
    }
    const escape = text => foundry.utils.escapeHTML(text);
    const items = suggestions.map(suggestion => {
      const unchecked = suggestion.uncheckedText.length
        ? `<small class="trigger-prompts-suggestions__unchecked">Not checked: ${suggestion.uncheckedText.map(text => `“${escape(text)}”`).join(", ")}</small>`
        : "";
      const range = suggestion.parameters.rangeSquares === undefined ? "" : ` · range ${suggestion.parameters.rangeSquares} squares`;
      const note = suggestion.assignable ? "" : `<small>This is a reminder set on the actor's Trigger prompts dialog, not on a power.</small>`;
      return `<li><strong>${escape(suggestion.label)}</strong> — matched “${escape(suggestion.matchedText)}”${range}${unchecked}${note}</li>`;
    }).join("");
    const result = suggestions.length
      ? `<p class="hint">Ticked below for you to review. Nothing changes until you press Save.</p><ul>${items}</ul>`
      : `<p class="hint">No known trigger matches this text, so nothing is suggested.</p>`;
    return `<section class="trigger-prompts-suggestions">
      <p class="trigger-prompts-config__reference"><strong>Power trigger:</strong> ${escape(triggerText)}</p>
      <label><input type="checkbox" name="${SUGGEST_TOGGLE}"> Suggest triggers from this trigger text</label>
      <div class="trigger-prompts-suggestions__panel" hidden>${result}</div>
    </section>`;
  }

  /**
   * Ticks the rows for assignable suggestions.
   *
   * @param {{elements: Object<string, {checked?: boolean, value?: string}>}} form
   * @param {ReturnType<typeof suggestTriggersFromText>} suggestions
   * @returns {Object<string, {checked: boolean, range?: string, source: string}>}
   *   The rows' previous state, for {@link PowerTriggerDialog.restoreForm}.
   */
  static applySuggestions(form, suggestions) {
    const previous = {};
    for (const suggestion of suggestions.filter(candidate => candidate.assignable)) {
      const id = suggestion.triggerId;
      previous[id] = { checked: form.elements[`${id}.enabled`].checked, range: form.elements[`${id}.rangeSquares`]?.value, source: form.elements[`${id}.source`].value };
      form.elements[`${id}.enabled`].checked = true;
      form.elements[`${id}.source`].value = ASSIGNMENT_SOURCE.TEXT;
      if (suggestion.parameters.rangeSquares !== undefined && form.elements[`${id}.rangeSquares`]) {
        form.elements[`${id}.rangeSquares`].value = String(suggestion.parameters.rangeSquares);
      }
      for (const key of ["attackTypes", "defenseTypes", "damageTypes"]) {
        const controls = Array.from(form.querySelectorAll?.(`[name="${id}.${key}"]`) ?? []);
        previous[id][key] = controls.map(control => control.checked);
        for (const control of controls) {
          control.checked = suggestion.parameters[key]?.includes(control.value) ?? control.checked;
        }
      }
      const nonMinion = form.elements[`${id}.nonMinion`];
      if (suggestion.parameters.nonMinion && nonMinion) {
        previous[id].nonMinion = nonMinion.checked;
        nonMinion.checked = true;
      }
    }
    return previous;
  }

  /**
   * Puts rows back to the state {@link PowerTriggerDialog.applySuggestions} saved.
   *
   * @param {{elements: Object<string, {checked?: boolean, value?: string}>}} form
   * @param {Object<string, {checked: boolean, range?: string, source: string}>} previous
   */
  static restoreForm(form, previous) {
    for (const [id, state] of Object.entries(previous)) {
      form.elements[`${id}.enabled`].checked = state.checked;
      form.elements[`${id}.source`].value = state.source;
      if (state.range !== undefined && form.elements[`${id}.rangeSquares`]) {
        form.elements[`${id}.rangeSquares`].value = state.range;
      }
      for (const key of ["attackTypes", "defenseTypes", "damageTypes"]) {
        const controls = Array.from(form.querySelectorAll?.(`[name="${id}.${key}"]`) ?? []);
        controls.forEach((control, index) => { control.checked = state[key]?.[index] ?? control.checked; });
      }
      if (state.nonMinion !== undefined && form.elements[`${id}.nonMinion`]) {
        form.elements[`${id}.nonMinion`].checked = state.nonMinion;
      }
    }
  }

  /**
   * Reads the ticked rows of a submitted dialog into stored assignments.
   *
   * @param {FormData} data
   * @returns {Array<{triggerId: string, parameters: {rangeSquares?: number}, source: string}>}
   */
  static readAssignments(data) {
    return PowerTriggerDialog.assignableTriggers()
      .filter(trigger => data.has(`${trigger.id}.enabled`))
      .map(trigger => {
        const range = data.get(`${trigger.id}.rangeSquares`);
        const parsedRange = Number(range);
        return {
          triggerId: trigger.id,
          parameters: {
            ...(trigger.defaultRangeSquares === undefined ? {} : { rangeSquares: range === null || range === "" || !Number.isFinite(parsedRange) ? trigger.defaultRangeSquares : Math.max(0, parsedRange) }),
            ...Object.fromEntries([["attackTypes", ATTACK_TYPES], ["defenseTypes", DEFENSE_TYPES], ["damageTypes", DAMAGE_TYPES]].map(([key, allowed]) => [key, data.getAll(`${trigger.id}.${key}`).filter(value => allowed.includes(value))]).filter(([, values]) => values.length)),
            ...(trigger.companion && data.get(`${trigger.id}.companionActorUuid`) ? { companionActorUuid: String(data.get(`${trigger.id}.companionActorUuid`)) } : {}),
            ...Object.fromEntries(["nonMinion", "meleeOnly", "adjacentOnly", "criticalOnly"].filter(key => data.has(`${trigger.id}.${key}`)).map(key => [key, true])),
          },
          source: data.get(`${trigger.id}.source`) === ASSIGNMENT_SOURCE.TEXT ? ASSIGNMENT_SOURCE.TEXT : ASSIGNMENT_SOURCE.MANUAL,
        };
      });
  }

  /**
   * Wires the suggestion checkbox: on shows the panel and ticks the suggested
   * rows, off restores whatever the rows held before.
   *
   * @param {HTMLFormElement} form
   * @param {ReturnType<typeof suggestTriggersFromText>} suggestions
   */
  static #bindSuggestionToggle(form, suggestions) {
    const toggle = form.querySelector(`[name='${SUGGEST_TOGGLE}']`);
    const panel = form.querySelector(".trigger-prompts-suggestions__panel");
    if (!toggle || !panel) {
      return;
    }
    let previous = {};
    toggle.addEventListener("change", () => {
      panel.hidden = !toggle.checked;
      if (toggle.checked) {
        previous = PowerTriggerDialog.applySuggestions(form, suggestions);
      } else {
        PowerTriggerDialog.restoreForm(form, previous);
        previous = {};
      }
    });
  }
}
