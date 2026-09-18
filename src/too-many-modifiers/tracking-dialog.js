const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

import { MODULE_ID } from "./constants.js";
import { TrackingHelper } from "./tracking-helper.js";

import { ConditionNoteHandler } from "./handlers/condition.js";
import { OngoingNoteHandler } from "./handlers/ongoing.js";
import { ModifierNoteHandler } from "./handlers/modifier.js";
import { ResistanceNoteHandler } from "./handlers/resistance.js";
import { ManualNoteHandler } from "./handlers/manual.js";

/**
 * Presents the form used to create and remove tracked notes on tokens.
 */
export class TrackingDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Creates a tracking dialog for the selected canvas tokens.
   *
   * @param {Token[]} tokens The tokens to edit.
   */
  constructor(tokens) {
    const options = {
      window: {
        title: `Editing tracking for ${tokens.length > 1 ? `${tokens.length} tokens` : `"${tokens[0].document.name}"`}`
      },
      position: {
        height: "auto",
        width: 600,
      }
    };

    super(options);
    this.currentTab = 'modifiers';
    this.tokens = tokens;
    this.combat = game.combats.find(c => c.combatants.some(combatant => combatant.actor?.id === tokens[0].document.actor?.id));
    // Set initial origin to current combatant's token
    this.selectedOrigin = this.combat?.combatant?.tokenId || null;
    this._originChangeHandler = this._onOriginChange.bind(this);
  }

  static DEFAULT_OPTIONS = {
    id: "too-much-too-track-dialog",
    tag: "form",
    form: {
      handler: TrackingDialog.onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    classes: [],
    actions: {
    }
  }

  /**
   * Creates a note from the submitted form and applies it to every token.
   *
   * @param {SubmitEvent} event The form submission event.
   * @param {HTMLFormElement} form The submitted form.
   * @param {FormDataExtended} formData The parsed Foundry form data.
   * @returns {Promise<void>}
   */
  static async onSubmit(event, form, formData) {
    const action = event.submitter.dataset.type;
    const data = formData.object;
    
    const effectData = this._getEffectData(data);

    const handlers = {
      conditions: new ConditionNoteHandler(data, effectData, this.tokenDocuments),
      ongoing: new OngoingNoteHandler(data, effectData, this.tokenDocuments),
      modifiers: new ModifierNoteHandler(data, effectData, this.tokenDocuments, this.combat),
      resistances: new ResistanceNoteHandler(data, effectData, this.tokenDocuments),
      manual: new ManualNoteHandler(data, effectData, this.tokenDocuments),
    };

    const notesToRemove = data.deleteNote != null ? this.getNotes().filter(note => data.deleteNote.includes(note.id)) : [];
    for (const tokenDoc of this.tokenDocuments) {
      await TrackingHelper.deleteNotesAndEffects(tokenDoc, notesToRemove);
    }

    const noteHandler = handlers[this.currentTab];
    if (noteHandler) {
      await noteHandler.create();
    } else {
      ui.notifications.warn(`No handler found for note type "${this.currentTab}". Please ensure the type is correct and a handler exists.`);
      return;
    }

    if (action === "saveAndClose") {
      this.close();
    } else {
      this.render();
    }
  }

  /**
   * Gets the documents represented by the selected canvas tokens.
   *
   * @returns {TokenDocument[]} The selected token documents.
   */
  get tokenDocuments() { return this.tokens.map(token => token.document); }

  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    notes: { template: "modules/too-many-modifiers/parts/notes-table.hbs" },
    conditions: { template: "modules/too-many-modifiers/parts/condition-section.hbs" },
    ongoing: { template: "modules/too-many-modifiers/parts/ongoing-section.hbs" },
    modifiers: { template: "modules/too-many-modifiers/parts/modifier-section.hbs" },
    resistances: { template: "modules/too-many-modifiers/parts/resistances-section.hbs" },
    manual: { template: "modules/too-many-modifiers/parts/manual-section.hbs" },
    duration: { template: "modules/too-many-modifiers/parts/duration-section.hbs" },
    footer: { template: "modules/too-many-modifiers/parts/footer.hbs" },
  }

  static TABS = {
    primary: {
      tabs: [{ id: 'conditions', label: "Conditions" }, { id: 'ongoing', label: "Ongoing" }, { id: 'modifiers', label: "Modifiers" }, { id: 'resistances', label: "Resistances" }, { id: 'manual', label: "Manual" }],
      initial: 'modifiers',
    }
  }

  /**
   * Prepares data shared by the dialog's rendered parts.
   *
   * @param {object} options Render options.
   * @returns {Promise<object>} The template context.
   */
  async _prepareContext(options) {
    const originCombatants = this._buildOriginCombatants();
    const conditionOptions = this._getConditionOptions();
    const damageTypeOptions = this._getDamageTypeOptions();
    const defaultDuration = this._getDefaultDuration();

    return {
      notes: [...this.getNotes()],
      defaultDuration,
      playerCombatants: originCombatants,
      defaultPlayerCombatant: originCombatants.find(c => c.tokenId === this.combat?.combatant?.tokenId) || null,
      conditions: conditionOptions,
      damageTypes: damageTypeOptions,
      tabs: this._prepareTabs("primary"),
    };
  }

  /**
   * Builds uniquely labelled combatant options, with PCs listed first.
   *
   * @returns {Combatant[]} Combatants for the origin selector.
   */
  _buildOriginCombatants() {
    const playerCombatants = [];
    const nonPlayerCombatants = [];

    // Add combatants for Effect Origin dropdown
    if (this.combat) {
      for (const c of this.combat.combatants) {
        if (c.actor?.type === "Player Character") {
          playerCombatants.push(c);
        } else {
          nonPlayerCombatants.push(c);
        }
      }
    }

    // Combine lists with PCs first, then add duplicate numbering
    const combinedCombatants = [...playerCombatants, ...nonPlayerCombatants];
    const nameCounts = new Map();
    const originCombatants = combinedCombatants.map(c => {
      const baseName = c.name;
      const count = nameCounts.get(baseName) || 0;
      nameCounts.set(baseName, count + 1);
      
      // Add numbering if there are duplicates
      const displayName = count > 0 ? `${baseName} (${count + 1})` : baseName;
      
      return {
        ...c,
        name: displayName,
        originalName: baseName
      };
    });

    // Go back and update the first occurrence if there were duplicates
    const finalOriginCombatants = originCombatants.map(c => {
      const totalCount = nameCounts.get(c.originalName);
      if (totalCount > 1 && !c.name.includes('(')) {
        return {
          ...c,
          name: `${c.originalName} (1)`
        };
      }
      return c;
    });

    return finalOriginCombatants;
  }

  /**
   * Builds the native DnD4e Active Effect duration data for this submission.
   *
   * @param {object} data The submitted form data.
   * @returns {object} Active Effect source data shared by every handler.
   */
  _getEffectData(data) {
    const durationType = data.duration || "custom";
    const selectedOrigin = data.origin || data.ongoingOrigin || data.resistanceOrigin || this.selectedOrigin;
    const originCombatant = this.combat?.combatants.find(combatant => combatant.tokenId === selectedOrigin);
    const effectData = {
      flags: {
        [MODULE_ID]: {
          tracked: true,
          durationLabel: data.durationOverride || "Custom",
        },
      },
      system: {
        durationType: "custom",
      },
    };

    switch(durationType) {
      case "encounter":
        effectData.system.durationType = "endOfEncounter";
        effectData.flags[MODULE_ID].durationLabel = "Encounter";
        break;
      case "round":
        effectData.system.durationType = "";
        effectData.duration = {
          value: 1,
          units: "rounds",
          expiry: "roundStart",
        };
        effectData.flags[MODULE_ID].durationLabel = "Round";
        break;
      case "save":
        effectData.system.durationType = "saveEnd";
        effectData.flags[MODULE_ID].durationLabel = "Save Ends";
        break;
      case "eot-origin":
        if (originCombatant?.actor) {
          effectData.system.durationType = "endOfUserTurn";
          effectData.origin = originCombatant.actor.uuid;
          effectData.flags[MODULE_ID].durationLabel = `EoT ${originCombatant.name}`;
        }
        break;
      case "eot-target":
        effectData.system.durationType = "endOfTargetTurn";
        effectData.flags[MODULE_ID].durationLabel = "EoT Target";
        break;
      default:
        break;
    }

    return effectData;
  }

  /**
   * Builds condition options from Foundry's configured status effects.
   *
   * @returns {{value: string, label: string}[]} The condition options.
   */
  _getConditionOptions() {
    const conditions = CONFIG.statusEffects || [];
    return conditions.map(condition => {
      const label = condition.label || condition.name || condition;
      const value = condition.name || condition.id || label;
      return { value, label };
    });
  }

  /**
   * Builds damage-type options from the DnD4e configuration.
   *
   * @returns {{value: string, label: string}[]} The damage-type options.
   */
  _getDamageTypeOptions() {
    const damageTypes = CONFIG.DND4E?.damageTypes || {};
    return Object.entries(damageTypes).map(([key, label]) => {
      return { value: key, label };
    });
  }

  /**
   * Determines the default duration for a new note.
   *
   * @returns {string} The default duration type.
   */
  _getDefaultDuration() {
    // Default to EoT Origin if we have a selected origin
    if (this.selectedOrigin) {
      return "eot-origin";
    }
    // Otherwise default to encounter
    return "encounter";
  }

  /**
   * Adds tab state to a rendered application part.
   *
   * @param {string} partId The part being rendered.
   * @param {object} context The shared template context.
   * @returns {Promise<object>} The part context.
   */
  async _preparePartContext(partId, context) {
    const tab = context.tabs?.[partId];
    if (tab) {
      context.tab = { ...tab };
      // Set active class for initial tab
      if (partId === "modifiers" && this.currentTab === "modifiers") {
        context.tab.cssClass = "active";
      }
    }
    return context;
  }

  /**
   * Gets notes that are shared by every selected token.
   *
   * @returns {object[]} The shared notes.
   */
  getNotes() {
    const primaryEffects = TrackingHelper.getTrackedEffects(this.tokenDocuments[0]);
    return primaryEffects
      .map(effect => ({
        id: effect.id,
        text: TrackingHelper.stripHtml(effect.description),
        duration: effect.duration.label || effect.system.durationType,
      }))
      .filter(note => this.tokenDocuments.every(tokenDoc => {
        return TrackingHelper.getTrackedEffects(tokenDoc).some(effect => {
          return TrackingHelper.stripHtml(effect.description) === note.text
            && (effect.duration.label || effect.system.durationType) === note.duration;
        });
      }));
  }

  /**
   * Changes the selected note type and applies its default duration.
   *
   * @param {Event} event The tab click event.
   */
  _onClickTab(event) {
    const selectedTab = event.srcElement.dataset.tab;
    this.currentTab = selectedTab;

    // Auto-set duration based on selected tab
    if (selectedTab === "ongoing") {
      // Set "save" radio button for ongoing effects
      const saveRadio = this.element.querySelector('[name="duration"][value="save"]');
      if (saveRadio) saveRadio.checked = true;
    } else {
      // Set "eot-origin" radio button for other tabs if we have a selected origin
      if (this.selectedOrigin) {
        const eotOriginRadio = this.element.querySelector('[name="duration"][value="eot-origin"]');
        if (eotOriginRadio) eotOriginRadio.checked = true;
      }
    }

    super._onClickTab(event);
  }

  /**
   * Stores the selected origin token ID.
   *
   * @param {Event} event The origin selector change event.
   */
  _onOriginChange(event) {
    this.selectedOrigin = event.target.value;
    // No need to re-render since radio buttons are static
  }

  /**
   * Wires dialog controls after the application has rendered.
   *
   * @param {object} context The rendered template context.
   * @param {object} options Render options.
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Add event listener for origin dropdown
    const originSelect = this.element.querySelector('#origin');
    if (originSelect) {
      // Remove old listener if it exists to prevent memory leaks
      originSelect.removeEventListener('change', this._originChangeHandler);
      // Add the listener
      originSelect.addEventListener('change', this._originChangeHandler);
    }

    // Auto-select custom radio button when custom textfield is focused or typed in
    const customField = this.element.querySelector('#durationOverride');
    const customRadio = this.element.querySelector('#customRadio');
    if (customField && customRadio) {
      customField.addEventListener('focus', () => {
        customRadio.checked = true;
      });
      customField.addEventListener('input', () => {
        customRadio.checked = true;
      });
    }

    // Add event listeners for modifier value spinner
    const increaseBtn = this.element.querySelector('#increaseModifier');
    const decreaseBtn = this.element.querySelector('#decreaseModifier');
    const numberValue = this.element.querySelector('#numberValue');

    if (increaseBtn && numberValue) {
      increaseBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(numberValue.value) || 0;
        numberValue.value = currentValue + 1;
      });
    }

    if (decreaseBtn && numberValue) {
      decreaseBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(numberValue.value) || 0;
        numberValue.value = currentValue - 1;
      });
    }

    // Add event listeners for quick ability buttons
    const quickAbilityButtons = this.element.querySelectorAll('.quick-ability');
    quickAbilityButtons.forEach(button => {
      button.addEventListener('click', () => {
        const ability = button.dataset.ability;
        const sign = button.dataset.sign;
        
        // Get the origin combatant
        const originSelect = this.element.querySelector('#origin');
        const originTokenId = originSelect?.value;
        
        if (!originTokenId || !this.combat) {
          ui.notifications.warn("Please select an origin combatant first");
          return;
        }
        
        const originCombatant = this.combat.combatants.find(c => c.tokenId === originTokenId);
        if (!originCombatant?.actor) {
          ui.notifications.error("Selected origin combatant not found");
          return;
        }
        
        // Get the ability modifier value
        const abilityValue = originCombatant.actor.system.abilities[ability]?.mod || 0;
        
        // Set the value (hardset, not add)
        const numberValue = this.element.querySelector('#numberValue');
        if (numberValue) {
          numberValue.value = sign === '+' ? Math.abs(abilityValue) : -Math.abs(abilityValue);
        }
      });
    });

    // Add event listeners for ongoing value spinner
    const increaseOngoingBtn = this.element.querySelector('#increaseOngoing');
    const decreaseOngoingBtn = this.element.querySelector('#decreaseOngoing');
    const ongoingDamage = this.element.querySelector('#ongoingDamage');

    if (increaseOngoingBtn && ongoingDamage) {
      increaseOngoingBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(ongoingDamage.value) || 0;
        ongoingDamage.value = currentValue + 1;
      });
    }

    if (decreaseOngoingBtn && ongoingDamage) {
      decreaseOngoingBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(ongoingDamage.value) || 0;
        ongoingDamage.value = currentValue - 1;
      });
    }

    // Add event listeners for ongoing quick ability buttons
    const quickAbilityOngoingButtons = this.element.querySelectorAll('.quick-ability-ongoing');
    quickAbilityOngoingButtons.forEach(button => {
      button.addEventListener('click', () => {
        const ability = button.dataset.ability;
        const sign = button.dataset.sign;
        
        // Get the origin combatant
        const ongoingOriginSelect = this.element.querySelector('#ongoingOrigin');
        const originTokenId = ongoingOriginSelect?.value;
        
        if (!originTokenId || !this.combat) {
          ui.notifications.warn("Please select an origin combatant first");
          return;
        }
        
        const originCombatant = this.combat.combatants.find(c => c.tokenId === originTokenId);
        if (!originCombatant?.actor) {
          ui.notifications.error("Selected origin combatant not found");
          return;
        }
        
        // Get the ability modifier value
        const abilityValue = originCombatant.actor.system.abilities[ability]?.mod || 0;
        
        // Set the value (hardset, not add)
        const ongoingDamage = this.element.querySelector('#ongoingDamage');
        if (ongoingDamage) {
          ongoingDamage.value = sign === '+' ? Math.abs(abilityValue) : -Math.abs(abilityValue);
        }
      });
    });

    // Add event listeners for resistance value spinner
    const increaseResistanceBtn = this.element.querySelector('#increaseResistance');
    const decreaseResistanceBtn = this.element.querySelector('#decreaseResistance');
    const resistanceValue = this.element.querySelector('#resistanceValue');

    if (increaseResistanceBtn && resistanceValue) {
      increaseResistanceBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(resistanceValue.value) || 0;
        resistanceValue.value = currentValue + 1;
      });
    }

    if (decreaseResistanceBtn && resistanceValue) {
      decreaseResistanceBtn.addEventListener('click', () => {
        const currentValue = Number.parseInt(resistanceValue.value) || 0;
        resistanceValue.value = currentValue - 1;
      });
    }

    // Add event listeners for resistance quick ability buttons
    const quickAbilityResistanceButtons = this.element.querySelectorAll('.quick-ability-resistance');
    quickAbilityResistanceButtons.forEach(button => {
      button.addEventListener('click', () => {
        const ability = button.dataset.ability;
        const sign = button.dataset.sign;
        
        // Get the origin combatant
        const resistanceOriginSelect = this.element.querySelector('#resistanceOrigin');
        const originTokenId = resistanceOriginSelect?.value;
        
        if (!originTokenId || !this.combat) {
          ui.notifications.warn("Please select an origin combatant first");
          return;
        }
        
        const originCombatant = this.combat.combatants.find(c => c.tokenId === originTokenId);
        if (!originCombatant?.actor) {
          ui.notifications.error("Selected origin combatant not found");
          return;
        }
        
        // Get the ability modifier value
        const abilityValue = originCombatant.actor.system.abilities[ability]?.mod || 0;
        
        // Set the value (hardset, not add)
        const resistanceValue = this.element.querySelector('#resistanceValue');
        if (resistanceValue) {
          resistanceValue.value = sign === '+' ? Math.abs(abilityValue) : -Math.abs(abilityValue);
        }
      });
    });
  }
}
