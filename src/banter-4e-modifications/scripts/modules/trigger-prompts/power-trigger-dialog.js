import { TRIGGER_ID, TRIGGER_PROMPT_UI } from "./constants.js";
import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { ASSIGNMENT_SOURCE, ItemTriggerAssignments } from "./item-trigger-assignments.js";
import { TRIGGERS } from "./trigger-definitions.js";
import { suggestTriggersFromText } from "./trigger-text-suggestions.js";

/** Name of the checkbox that turns suggestions on for the power being edited. */
const SUGGEST_TOGGLE = "suggestFromText";

/**
 * The per-power trigger dialog.
 *
 * Each assignable trigger is a row the user ticks. A power's own trigger text
 * can be read into suggestions, but only on request: the "Suggest" checkbox is
 * off every time the dialog opens, ticking it shows what was understood and
 * pre-ticks the matching rows, and nothing is stored until the user presses Save.
 */
export class PowerTriggerDialog {
  /**
   * Opens the dialog for a power.
   *
   * @param {Item} item
   *   DnD4e power, owned by an actor or free-standing.
   */
  static show(item) {
    if (item.type !== "power") {
      return;
    }
    const assignments = new Map(ActorTriggerConfiguration.assignmentsForItem(item).map(assignment => [assignment.triggerId, assignment]));
    const triggerText = ItemTriggerAssignments.getTriggerText(item);
    const suggestions = suggestTriggersFromText(triggerText);
    const rows = PowerTriggerDialog.assignableTriggers().map(trigger => PowerTriggerDialog.renderAssignmentRow(trigger, assignments.get(trigger.id))).join("");
    const dialog = new foundry.applications.api.DialogV2({
      window: { title: `${item.name}: Trigger prompts` },
      // DialogV2 already wraps its content in a form; a nested <form> is dropped by the HTML parser.
      content: `<div class="${TRIGGER_PROMPT_UI.CONFIG_CLASS}">${PowerTriggerDialog.renderSuggestionPanel(triggerText, suggestions)}${rows}</div>`,
      position: { width: 640 },
      buttons: [{
        action: "save",
        label: "Save",
        default: true,
        callback: (event, button, app) => ItemTriggerAssignments.write(item, PowerTriggerDialog.readAssignments(new FormData(app.element.querySelector("form")))),
      }],
    });
    dialog.addEventListener("render", () => PowerTriggerDialog.#bindSuggestionToggle(dialog.element.querySelector("form"), suggestions));
    dialog.render({ force: true });
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
    const badge = source === ASSIGNMENT_SOURCE.TEXT ? `<span class="trigger-prompts-config__badge">from trigger text</span>` : "";
    return `<section class="trigger-prompts-config__row">
      <div class="trigger-prompts-config__details"><strong>${foundry.utils.escapeHTML(trigger.label)}</strong>${badge}<p class="hint">${foundry.utils.escapeHTML(trigger.description)}</p></div>
      <div class="trigger-prompts-config__controls"><label><input type="checkbox" name="${trigger.id}.enabled" ${checked}> Assigned</label>${range}<input type="hidden" name="${trigger.id}.source" value="${source}"></div>
    </section>`;
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
          parameters: trigger.defaultRangeSquares === undefined ? {} : { rangeSquares: range === null || range === "" || !Number.isFinite(parsedRange) ? trigger.defaultRangeSquares : Math.max(0, parsedRange) },
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
