import { getEncounterCalculation } from "./encounter-calculation.js";

const MODULE_ID = "dnd4e-health-display";
const ACTIVE_SETTING = "activeCombatStart";
const PRESENTATION_FLAG = "presentation";
const PRESET_FLAG = "preset";
const PRESETS_FOLDER_NAME = "Battle Briefings";
const SETUP_TEMPLATE = `modules/${MODULE_ID}/scripts/combat-start/combat-start-setup.hbs`;
const DISPLAY_TEMPLATE = `modules/${MODULE_ID}/scripts/combat-start/combat-start-display.hbs`;
const CALCULATION_TEMPLATE = `modules/${MODULE_ID}/scripts/combat-start/encounter-calculation.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Register the world state used by the independent combat-start submodule. */
export function registerCombatStartSettings() {
	game.settings.register(MODULE_ID, ACTIVE_SETTING, {
		name: "Active Battle Briefing presentation",
		scope: "world",
		config: false,
		type: Object,
		default: {},
		onChange: synchronizeCombatStartDisplay,
	});

}

/** Register combat-tracker controls and the shared presentation lifecycle. */
export function registerCombatStart() {
	Hooks.on("renderCombatTracker", addCombatStartButton);
	Hooks.on("createCombatant", refreshCombatStartDisplay);
	Hooks.on("updateCombatant", refreshCombatStartDisplay);
	Hooks.on("deleteCombatant", refreshCombatStartDisplay);
	Hooks.on("updateActor", refreshCalculationForActor);
	Hooks.on("updateToken", refreshCalculationForToken);
	Hooks.on("updateCombat", refreshCombatStartDisplayForCombat);
	Hooks.on("deleteCombat", closeDeletedCombatDisplay);

	synchronizeCombatStartDisplay(game.settings.get(MODULE_ID, ACTIVE_SETTING));
	ui.combat?.render();
}

/** Add the GM-only Battle Briefing button to the main combat sidebar. */
function addCombatStartButton(app, element) {
	if (app !== ui.combat || app.isPopout) {
		element.querySelector("[data-dnd4e-combat-start]")?.remove();
		return;
	}

	if (!game.user.isGM || element.querySelector("[data-dnd4e-combat-start]")) {
		return;
	}

	const header = element.querySelector(".combat-tracker-header")
		?? element.querySelector(".directory-header")
		?? element.querySelector("header");
	if (!header) {
		return;
	}

	const button = document.createElement("button");
	button.type = "button";
	button.className = "dnd4e-combat-start__tracker-button";
	button.dataset.dnd4eCombatStart = "";
	button.title = "Prepare a Battle Briefing presentation";
	button.setAttribute("aria-label", "Battle Briefing");
	button.innerHTML = '<i class="fa-solid fa-file-lines" aria-hidden="true"></i>';
	button.addEventListener("click", () => void openBattleBriefing(app.viewed ?? game.combat));
	(header.querySelector(".battle-momentum-tracker-controls") ?? header).append(button);
}

/** Open the setup window, or jump straight to the live briefing if the encounter already started. */
export async function openBattleBriefing(combat) {
	if (combat?.started) {
		await openStartedCombatDisplay(combat);
		return;
	}

	await openCombatStartSetup(combat);
}

/**
 * Show the live briefing for an encounter already in progress, skipping the setup dialog.
 *
 * The encounter is already running, so this is a GM-only peek: unlike a freshly prepared
 * presentation, it never touches the synchronized {@link ACTIVE_SETTING} and therefore never
 * opens the display for connected players.
 */
async function openStartedCombatDisplay(combat) {
	if (ui.Dnd4eCombatStartDisplay?.combatId === combat.id) {
		ui.Dnd4eCombatStartDisplay.render(true);
		return;
	}

	if (!getCombatPresentation(combat)) {
		await setCombatPresentation(combat, {
			...getDefaultPresentation(),
			title: combat.name || getDefaultPresentation().title,
		});
	}

	await ui.Dnd4eCombatStartDisplay?.close();
	ui.Dnd4eCombatStartDisplay = new CombatStartDisplay({}, { combatId: combat.id, isGMOnly: true });
	ui.Dnd4eCombatStartDisplay.render(true);
}

/**
 * Read the persisted Battle Briefing content stored on the encounter itself, so it survives
 * hiding the presentation, closing windows, or the encounter starting.
 *
 * @param {Combat|null} combat
 * @returns {object|null}
 */
function getCombatPresentation(combat) {
	return combat?.getFlag(MODULE_ID, PRESENTATION_FLAG) ?? null;
}

/** @param {Combat} combat @param {object} presentation */
async function setCombatPresentation(combat, presentation) {
	await combat.setFlag(MODULE_ID, PRESENTATION_FLAG, presentation);
}

/** @param {object|null} presentation @returns {object} */
function mapPresentationToDraft(presentation) {
	const defaults = getDefaultPresentation();
	if (!presentation) {
		return defaults;
	}

	return {
		name: "",
		title: presentation.title ?? defaults.title,
	};
}

/** Open the GM setup window for the currently viewed encounter. */
async function openCombatStartSetup(combat) {
	if (!combat) {
		if (!canvas.scene) {
			ui.notifications.warn("Activate a scene before preparing its Battle Briefing screen.");
			return;
		}

		try {
			combat = await Combat.create({
				scene: canvas.scene.id,
				active: true,
			});
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to create a combat encounter.`, error);
			ui.notifications.error("A combat encounter could not be created. Check the console for details.");
			return;
		}
	}

	if (!combat) {
		ui.notifications.error("A combat encounter could not be created.");
		return;
	}

	if (!ui.Dnd4eCombatStartSetup) {
		ui.Dnd4eCombatStartSetup = new CombatStartSetup({}, combat);
	}

	ui.Dnd4eCombatStartSetup.setCombat(combat);
	ui.Dnd4eCombatStartSetup.render(true);
}

/** Open, refresh, or close the presentation to match synchronized world state. */
function synchronizeCombatStartDisplay(presentation) {
	if (!presentation?.id) {
		closeCombatStartDisplay();
		return;
	}

	if (!ui.Dnd4eCombatStartDisplay) {
		ui.Dnd4eCombatStartDisplay = new CombatStartDisplay({}, presentation);
		ui.Dnd4eCombatStartDisplay.render(true);
		return;
	}

	ui.Dnd4eCombatStartDisplay.setPresentation(presentation);
}

/** Refresh the live display when its encounter membership changes. */
function refreshCombatStartDisplay(combatant) {
	refreshCombatStartSetup(combatant.parent);
	if (ui.Dnd4eCombatStartDisplay?.combatId === combatant.parent?.id) {
		ui.Dnd4eCombatStartDisplay.render();
	}
}

/** Preserve editor drafts while refreshing encounter membership or calculation data. */
function refreshCombatStartSetup(combat) {
	const setup = ui.Dnd4eCombatStartSetup;
	if (setup && setup.combat?.id === combat?.id) {
		setup.readDraft();
		setup.render();
	}
}

/** Refresh open briefings when an included actor's level, rank, or ownership changes. */
function refreshCalculationForActor(actor) {
	for (const combat of game.combats) {
		const combatant = combat.combatants.find((entry) => entry.actor === actor || entry.actorId === actor.id);
		if (combatant) {
			refreshCombatStartDisplay(combatant);
		}
	}
}

/** Refresh token-specific actor data and disposition without reacting to token movement. */
function refreshCalculationForToken(token, changes) {
	if (!["disposition", "actorId", "delta", "actorData"].some((key) => key in changes)) {
		return;
	}
	for (const combat of game.combats) {
		const combatant = combat.combatants.find((entry) => entry.tokenId === token.id && entry.sceneId === token.parent?.id);
		if (combatant) {
			refreshCombatStartDisplay(combatant);
		}
	}
}

/** Render the shared GM calculation panel only when its tab is open. */
async function renderCalculation(combat) {
	return foundry.applications.handlebars.renderTemplate(CALCULATION_TEMPLATE,
		getEncounterCalculation(combat, CONST.TOKEN_DISPOSITIONS.HOSTILE));
}

/** Refresh the presentation when its encounter advances to another turn. */
function refreshCombatStartDisplayForCombat(combat) {
	if (ui.Dnd4eCombatStartDisplay?.combatId === combat.id) {
		ui.Dnd4eCombatStartDisplay.render();
	}
}

/** Clear a presentation whose encounter was deleted. */
function closeDeletedCombatDisplay(combat) {
	if (ui.Dnd4eCombatStartDisplay?.combatId !== combat.id) {
		return;
	}

	if (game.user.isGM && !ui.Dnd4eCombatStartDisplay.presentation.isGMOnly) {
		void game.settings.set(MODULE_ID, ACTIVE_SETTING, {});
	} else {
		closeCombatStartDisplay();
	}
}

/** Close the synchronized presentation and clear its UI reference. */
function closeCombatStartDisplay() {
	const display = ui.Dnd4eCombatStartDisplay;
	ui.Dnd4eCombatStartDisplay = null;
	void display?.close();
}

class CombatStartSetup extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, combat) {
		super({ ...options, position: { width: 470, height: 900, ...options.position } });
		this.combat = combat;
		this.selectedPresetId = "";
		const presentation = getCombatPresentation(combat);
		this.activeTab = "briefing";
		this.draft = mapPresentationToDraft(presentation);
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-combat-start-setup",
		classes: ["dnd4e-combat-start-setup"],
		position: { width: 470, height: 900 },
		window: { title: "Prepare Battle Briefing", resizable: true },
		actions: {
			show: CombatStartSetup.prototype.onShow,
			savePreset: CombatStartSetup.prototype.onSavePreset,
			loadPreset: CombatStartSetup.prototype.onLoadPreset,
			deletePreset: CombatStartSetup.prototype.onDeletePreset,
			addFriendlyTokens: CombatStartSetup.prototype.onAddFriendlyTokens,
			addNeutralTokens: CombatStartSetup.prototype.onAddNeutralTokens,
			addHostileTokens: CombatStartSetup.prototype.onAddHostileTokens,
			toggleCombatantHidden: CombatStartSetup.prototype.onToggleCombatantHidden,
			removeCombatant: CombatStartSetup.prototype.onRemoveCombatant,
			showTab: CombatStartSetup.prototype.onShowTab,
		},
	};

	static PARTS = {
		main: { template: SETUP_TEMPLATE },
	};

	/** @param {Combat} combat The encounter being prepared. */
	setCombat(combat) {
		if (this.combat?.id === combat.id) {
			return;
		}

		this.combat = combat;
		this.selectedPresetId = "";
		const presentation = getCombatPresentation(combat);
		this.draft = mapPresentationToDraft(presentation);
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const presets = getPresets();
		const combatants = Array.from(this.combat?.combatants ?? []).map((combatant) => ({
			...getCombatantData(combatant),
			dispositionClass: getDispositionClass(combatant.token?.disposition),
			isHidden: isCombatantHidden(combatant),
		}));
		const availableFriendlyTokens = getAvailableSceneTokens(this.combat, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
		const availableNeutralTokens = getAvailableSceneTokens(this.combat, CONST.TOKEN_DISPOSITIONS.NEUTRAL);
		const availableHostileTokens = getAvailableSceneTokens(this.combat, CONST.TOKEN_DISPOSITIONS.HOSTILE);
		const selectedPreset = presets.find((preset) => preset.id === this.selectedPresetId);
		const missingCombatants = getMissingCombatants(selectedPreset?.expectedCombatants, this.combat);
		return foundry.utils.mergeObject(context, {
			combatName: this.combat?.name ?? "Encounter",
			showBriefing: this.activeTab === "briefing",
			showCalculation: this.activeTab === "calculation",
			calculationHTML: this.activeTab === "calculation" ? await renderCalculation(this.combat) : "",
			draft: this.draft,
			combatants,
			hasCombatants: combatants.length > 0,
			availableFriendlyCount: availableFriendlyTokens.length,
			availableNeutralCount: availableNeutralTokens.length,
			availableHostileCount: availableHostileTokens.length,
			hasAvailableFriendlyTokens: availableFriendlyTokens.length > 0,
			hasAvailableNeutralTokens: availableNeutralTokens.length > 0,
			hasAvailableHostileTokens: availableHostileTokens.length > 0,
			missingCombatants,
			hasMissingCombatants: missingCombatants.length > 0,
			presets: presets.map((preset) => ({
				...preset,
				selected: preset.id === this.selectedPresetId,
			})),
			hasPresets: presets.length > 0,
			hasSelectedPreset: Boolean(this.selectedPresetId),
		});
	}

	/** Switch between the briefing editor and encounter calculation. */
	onShowTab(event, target) {
		const tab = target.dataset.tab;
		if (!["briefing", "calculation"].includes(tab) || tab === this.activeTab) {
			return;
		}

		this.readDraft();
		this.activeTab = tab;
		this.render();
	}

	/** Remember the roster's scroll position across re-renders triggered by roster buttons. */
	async render(options) {
		const roster = this.element?.querySelector(".dnd4e-combat-start-setup__combatants");
		if (roster) {
			this._rosterScrollTop = roster.scrollTop;
		}
		return super.render(options);
	}

	/** Restore the roster scroll position after rendering. */
	_onRender(context, options) {
		super._onRender(context, options);
		const roster = this.element.querySelector(".dnd4e-combat-start-setup__combatants");

		if (roster && this._rosterScrollTop != null) {
			roster.scrollTop = this._rosterScrollTop;
		}

	}

	/**
	 * Keep the in-progress field values before performing an action.
	 *
	 * The preset name field and preset picker live in the dialog's shared header/footer, visible
	 * on every tab, so they're always read here. The remaining fields only exist in the DOM while
	 * the Battle Briefing tab is active and are skipped otherwise.
	 */
	readDraft() {
		if (!this.element) {
			return this.draft;
		}

		const name = this.element.querySelector('[name="presetName"]')?.value.trim() ?? this.draft.name;
		this.selectedPresetId = this.element.querySelector('[name="preset"]')?.value ?? this.selectedPresetId;

		if (this.activeTab !== "briefing") {
			this.draft = { ...this.draft, name };
			return this.draft;
		}

		this.draft = {
			name,
			title: this.element.querySelector('[name="title"]')?.value.trim() ?? "",
		};
		return this.draft;
	}

	/** Save the current briefing as a reusable world preset. */
	async onSavePreset() {
		const draft = this.readDraft();
		if (!draft.name) {
			ui.notifications.warn("Name a preset before saving it.");
			return;
		}

		try {
			const entry = await savePresetToJournal({
				existingId: this.selectedPresetId,
				name: draft.name,
				title: draft.title,
				expectedCombatants: getExpectedCombatants(this.combat),
			});
			this.selectedPresetId = entry.id;
			ui.notifications.info(`Saved Battle Briefing preset “${entry.name}”.`);
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to save Battle Briefing preset.`, error);
			ui.notifications.error("The Battle Briefing preset could not be saved. Check the console for details.");
		}
		this.render();
	}

	/** Load the selected preset into the editable fields. */
	onLoadPreset() {
		this.readDraft();
		const preset = getPresets().find((candidate) => candidate.id === this.selectedPresetId);
		if (!preset) {
			return;
		}

		this.draft = {
			name: preset.name,
			title: preset.title,
		};
		this.activeTab = "briefing";
		this.render();
	}

	/** Delete the selected reusable preset. */
	async onDeletePreset() {
		this.readDraft();
		if (!this.selectedPresetId) {
			return;
		}

		try {
			await deletePresetFromJournal(this.selectedPresetId);
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to delete Battle Briefing preset.`, error);
			ui.notifications.error("The Battle Briefing preset could not be deleted. Check the console for details.");
			return;
		}
		this.selectedPresetId = "";
		this.draft = getDefaultPresentation();
		this.render();
	}

	/** Add every missing friendly token from the encounter scene. */
	async onAddFriendlyTokens(event, target) {
		await this.addSceneTokens(CONST.TOKEN_DISPOSITIONS.FRIENDLY, "friendly", target);
	}

	/** Add every missing neutral token from the encounter scene. */
	async onAddNeutralTokens(event, target) {
		await this.addSceneTokens(CONST.TOKEN_DISPOSITIONS.NEUTRAL, "neutral", target);
	}

	/** Add every missing hostile token from the encounter scene. */
	async onAddHostileTokens(event, target) {
		await this.addSceneTokens(CONST.TOKEN_DISPOSITIONS.HOSTILE, "hostile", target);
	}

	/** Toggle whether a combatant and its scene token are hidden from players. */
	async onToggleCombatantHidden(event, target) {
		this.readDraft();
		const combatant = this.combat?.combatants.get(target.dataset.combatantId);
		if (!combatant) {
			return;
		}

		const hidden = !isCombatantHidden(combatant);
		try {
			if (combatant.token && combatant.token.hidden !== hidden) {
				await combatant.token.update({ hidden });
			}
			if (combatant.hidden !== hidden) {
				await combatant.update({ hidden });
			}
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to change combatant visibility.`, error);
			ui.notifications.error("The combatant visibility could not be changed. Check the console for details.");
		}
	}

	/** Remove a combatant from the encounter without deleting its scene token. */
	async onRemoveCombatant(event, target) {
		this.readDraft();
		const combatantId = target.dataset.combatantId;
		const combatant = this.combat?.combatants.get(combatantId);
		if (!combatant) {
			return;
		}

		target.disabled = true;
		try {
			await this.combat.deleteEmbeddedDocuments("Combatant", [combatantId]);
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to remove combatant from combat.`, error);
			ui.notifications.error("The combatant could not be removed. Check the console for details.");
			target.disabled = false;
		}
	}

	/**
	 * Add all scene tokens of one disposition which are not already combatants.
	 *
	 * @param {number} disposition
	 * @param {string} label
	 * @param {HTMLButtonElement} target
	 */
	async addSceneTokens(disposition, label, target) {
		this.readDraft();
		const tokens = getAvailableSceneTokens(this.combat, disposition);
		if (!tokens.length) {
			ui.notifications.info(`There are no new ${label} tokens to add to this encounter.`);
			return;
		}

		target.disabled = true;
		try {
			await this.combat.createEmbeddedDocuments("Combatant", tokens.map((token) => ({
				actorId: token.actorId,
				sceneId: token.parent.id,
				tokenId: token.id,
				hidden: token.hidden,
			})));
			ui.notifications.info(`Added ${tokens.length} ${label} token${tokens.length === 1 ? "" : "s"} to the encounter.`);
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to add ${label} tokens to combat.`, error);
			ui.notifications.error(`The ${label} tokens could not be added. Check the console for details.`);
			target.disabled = false;
		}
	}

	/** Save the presentation to the encounter and synchronize it to every connected user. */
	async onShow() {
		const draft = this.readDraft();
		if (!draft.title) {
			ui.notifications.warn("A title is required.");
			return;
		}

		await setCombatPresentation(this.combat, {
			title: draft.title,
		});
		await game.settings.set(MODULE_ID, ACTIVE_SETTING, {
			id: foundry.utils.randomID(),
			combatId: this.combat.id,
		});
		await this.close();
	}

	/** Clear the shared UI reference when this setup window closes. */
	_onClose(options) {
		ui.Dnd4eCombatStartSetup = null;
		super._onClose(options);
	}
}

class CombatStartDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, presentation) {
		super({ ...options, position: { width: 520, ...options.position } });
		this.presentation = presentation;
		this.activeTab = "briefing";
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-combat-start-display",
		classes: ["dnd4e-combat-start-display"],
		position: { width: 520, height: 800 },
		window: { title: "Battle Briefing", resizable: true },
		actions: {
			showTab: CombatStartDisplay.prototype.onShowTab,
			startCombat: CombatStartDisplay.prototype.onStartCombat,
			rollEnemyInitiative: CombatStartDisplay.prototype.onRollEnemyInitiative,
			rollInitiative: CombatStartDisplay.prototype.onRollInitiative,
			forceRollInitiative: CombatStartDisplay.prototype.onForceRollInitiative,
		},
	};

	static PARTS = {
		main: { template: DISPLAY_TEMPLATE },
	};

	get combatId() {
		return this.presentation.combatId;
	}

	/** @param {object} presentation The new synchronized presentation data. */
	setPresentation(presentation) {
		this.presentation = presentation;
		this.render();
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const combat = game.combats.get(this.combatId);
		const presentation = getCombatPresentation(combat) ?? getDefaultPresentation();
		const roster = getCombatStartRoster(combat);
		const initiativeTracker = getInitiativeTracker(combat, game.user.isGM);
		const canRollPlayerInitiative = !game.user.isGM && combat?.combatants.some((combatant) => !isCombatantHidden(combatant)
			&& combatant.actor?.hasPlayerOwner
			&& combatant.isOwner
			&& combatant.initiative == null);
		const hasUnrolledEnemyInitiative = combat?.combatants.some((combatant) => combatant.actor
			&& !combatant.actor.hasPlayerOwner
			&& combatant.initiative == null) ?? false;
		return foundry.utils.mergeObject(context, {
			...presentation,
			...roster,
			party: roster.party.map((member) => ({
				...member,
				initiativePlacement: initiativeTracker.rolled.find((entry) => entry.id === member.id)?.seq,
			})),
			isGM: game.user.isGM,
			combatStarted: Boolean(combat?.started),
			canRollPlayerInitiative,
			hasUnrolledEnemyInitiative,
			initiativeTracker,
			initiativeTrackerPlacement: "bottom",
			showBriefing: this.activeTab === "briefing",
			showCalculation: game.user.isGM && this.activeTab === "calculation",
			calculationHTML: game.user.isGM && this.activeTab === "calculation" ? await renderCalculation(combat) : "",
		});
	}

	/** Remember the party list's scroll position across re-renders triggered by roster buttons. */
	async render(options) {
		const heroes = this.element?.querySelector(".dnd4e-combat-start__heroes");
		if (heroes) {
			this._heroesScrollTop = heroes.scrollTop;
		}
		return super.render(options);
	}

	/** Initialize enlarged portrait previews and editable initiative fields after each render. */
	_onRender(context, options) {
		super._onRender(context, options);
		removePortraitPreview();
		initializePortraitPreviews(this.element);
		const heroes = this.element.querySelector(".dnd4e-combat-start__heroes");
		if (heroes && this._heroesScrollTop != null) {
			heroes.scrollTop = this._heroesScrollTop;
		}
		this.element.querySelector(".dnd4e-combat-start__initiative-chip.is-current")
			?.scrollIntoView({ inline: "center", block: "nearest" });
		for (const input of this.element.querySelectorAll(".dnd4e-combat-start__initiative-input")) {
			input.addEventListener("change", () => this.onEditInitiative(input));
		}
	}

	/** Let the GM manually set or clear a PC's initiative. */
	async onEditInitiative(input) {
		const combat = game.combats.get(this.combatId);
		const combatant = combat?.combatants.get(input.dataset.combatantId);
		if (!combatant) {
			return;
		}

		const value = input.value.trim();
		try {
			if (value === "") {
				await combatant.update({ initiative: null });
			} else {
				await combat.setInitiative(combatant.id, Number(value));
			}
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to set initiative.`, error);
			ui.notifications.error("Initiative could not be set. Check the console for details.");
		}
	}

	/** Switch the visible presentation tab. */
	onShowTab(event, target) {
		const tab = target.dataset.tab;
		if (!["briefing", "calculation"].includes(tab) || (!game.user.isGM && tab !== "briefing")) {
			return;
		}

		this.activeTab = tab;
		this.render();
	}

	/** Roll every NPC and start the encounter. */
	async onStartCombat(event, target) {
		if (!game.user.isGM) {
			return;
		}

		target.disabled = true;
		const combat = game.combats.get(this.combatId);
		if (!combat) {
			ui.notifications.error("The prepared encounter no longer exists.");
			target.disabled = false;
			return;
		}

		try {
			if (!combat.started) {
				await combat.startCombat();
			}
			await this.close();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to start prepared encounter.`, error);
			ui.notifications.error("The encounter could not be started. Check the console for details.");
			target.disabled = false;
		}
	}

	/** Roll initiative for every NPC without starting the encounter. */
	async onRollEnemyInitiative(event, target) {
		if (!game.user.isGM) {
			return;
		}

		const combat = game.combats.get(this.combatId);
		const npcIds = combat?.combatants
			.filter((combatant) => combatant.actor && !combatant.actor.hasPlayerOwner && combatant.initiative == null)
			.map((combatant) => combatant.id) ?? [];
		if (!npcIds.length) {
			ui.notifications.info("Every NPC combatant already has an initiative roll.");
			return;
		}

		target.disabled = true;
		try {
			await combat.rollInitiative(npcIds);
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to roll enemy initiative.`, error);
			ui.notifications.error("Enemy initiative could not be rolled. Check the console for details.");
			target.disabled = false;
		}
	}

	/** Roll initiative for every player combatant owned by the current user. */
	async onRollInitiative(event, target) {
		if (game.user.isGM) {
			return;
		}

		const combat = game.combats.get(this.combatId);
		const ownedPlayerIds = combat?.combatants
			.filter((combatant) => !isCombatantHidden(combatant)
				&& combatant.actor?.hasPlayerOwner
				&& combatant.isOwner
				&& combatant.initiative == null)
			.map((combatant) => combatant.id) ?? [];
		if (!ownedPlayerIds.length) {
			ui.notifications.info("Your initiative has already been rolled.");
			return;
		}

		target.disabled = true;
		try {
			await combat.rollInitiative(ownedPlayerIds);
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to roll player initiative.`, error);
			ui.notifications.error("Initiative could not be rolled. Check the console for details.");
		} finally {
			target.disabled = false;
		}
	}

	/** GM forces one player combatant to roll initiative. */
	async onForceRollInitiative(event, target) {
		if (!game.user.isGM) {
			return;
		}

		const combat = game.combats.get(this.combatId);
		const combatantId = target.dataset.combatantId;
		if (!combat?.combatants.has(combatantId)) {
			return;
		}

		target.disabled = true;
		try {
			await combat.rollInitiative([combatantId]);
			this.render();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to force initiative roll.`, error);
			ui.notifications.error("Initiative could not be rolled. Check the console for details.");
			target.disabled = false;
		}
	}

	/** Turn GM dismissal of a synchronized presentation into a synchronized hide; a GM-only peek and player dismissal both close normally. */
	async close(options = {}) {
		if (!this.presentation.isGMOnly && game.user.isGM && game.settings.get(MODULE_ID, ACTIVE_SETTING)?.id) {
			await game.settings.set(MODULE_ID, ACTIVE_SETTING, {});
			return this;
		}

		removePortraitPreview();
		return super.close(options);
	}

	/** Clear the shared UI reference once a GM-only peek actually closes. */
	_onClose(options) {
		super._onClose(options);
		if (ui.Dnd4eCombatStartDisplay === this) {
			ui.Dnd4eCombatStartDisplay = null;
		}
	}
}

/** @returns {object} */
function getDefaultPresentation() {
	return {
		name: "",
		title: "No Road Back",
	};
}

/** Attach hover and keyboard-focus previews to combatant portraits. */
function initializePortraitPreviews(element) {
	for (const portrait of element.querySelectorAll("[data-combat-start-portrait]")) {
		portrait.addEventListener("mouseenter", () => showPortraitPreview(portrait));
		portrait.addEventListener("mouseleave", removePortraitPreview);
		portrait.addEventListener("focus", () => showPortraitPreview(portrait));
		portrait.addEventListener("blur", removePortraitPreview);
	}
}

/** @param {HTMLImageElement} portrait */
function showPortraitPreview(portrait) {
	removePortraitPreview();
	const preview = document.createElement("aside");
	preview.className = "dnd4e-combat-start-portrait-preview";
	const image = document.createElement("img");
	image.src = portrait.src;
	image.alt = "";
	const name = document.createElement("strong");
	name.textContent = portrait.dataset.portraitName ?? "";
	preview.append(image, name);
	document.body.appendChild(preview);

	const portraitRect = portrait.getBoundingClientRect();
	const previewRect = preview.getBoundingClientRect();
	const gap = 12;
	const left = portraitRect.right + gap + previewRect.width <= window.innerWidth
		? portraitRect.right + gap
		: portraitRect.left - previewRect.width - gap;
	const top = Math.min(Math.max(gap, portraitRect.top + portraitRect.height / 2 - previewRect.height / 2), window.innerHeight - previewRect.height - gap);
	preview.style.left = `${left}px`;
	preview.style.top = `${top}px`;
}

/** Remove the currently visible enlarged portrait preview. */
function removePortraitPreview() {
	document.querySelector(".dnd4e-combat-start-portrait-preview")?.remove();
}

/** @returns {Folder|null} The dedicated Journal folder holding Battle Briefing presets, if it has been created yet. */
function getPresetsFolder() {
	return game.folders.find((folder) => folder.type === "JournalEntry" && folder.name === PRESETS_FOLDER_NAME) ?? null;
}

/** @returns {Promise<Folder>} The dedicated Journal folder holding Battle Briefing presets, creating it on first use. */
async function ensurePresetsFolder() {
	return getPresetsFolder() ?? Folder.create({ name: PRESETS_FOLDER_NAME, type: "JournalEntry" });
}

/**
 * Read every Battle Briefing preset from its dedicated Journal folder.
 *
 * @returns {Array<object>}
 */
function getPresets() {
	const folder = getPresetsFolder();
	if (!folder) {
		return [];
	}

	return game.journal
		.filter((entry) => entry.folder?.id === folder.id)
		.map((entry) => mapEntryToPreset(entry))
		.filter(Boolean);
}

/** @param {JournalEntry} entry @returns {object|null} */
function mapEntryToPreset(entry) {
	const preset = entry.getFlag(MODULE_ID, PRESET_FLAG);
	return preset ? { id: entry.id, name: entry.name, ...preset } : null;
}

/**
 * Create or update the Journal Entry backing a Battle Briefing preset.
 *
 * The structured preset data lives entirely in a module flag; the entry's single page is a
 * read-only summary regenerated on every save, so the entry isn't a blank document if a GM
 * opens it directly from the sidebar.
 *
 * @param {object} preset
 * @returns {Promise<JournalEntry>}
 */
async function savePresetToJournal(preset) {
	const { existingId, name, ...flagData } = preset;
	const summaryPage = buildPresetSummaryPage(name, flagData.title);

	const existing = existingId ? game.journal.get(existingId) : null;
	if (existing) {
		await existing.update({ name });
		await existing.setFlag(MODULE_ID, PRESET_FLAG, flagData);
		const page = existing.pages.contents[0];
		if (page) {
			await page.update(summaryPage);
		} else {
			await existing.createEmbeddedDocuments("JournalEntryPage", [summaryPage]);
		}
		return existing;
	}

	const folder = await ensurePresetsFolder();
	return JournalEntry.create({
		name,
		folder: folder.id,
		pages: [summaryPage],
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
		flags: { [MODULE_ID]: { [PRESET_FLAG]: flagData } },
	});
}

/** @param {string} id @returns {Promise<void>} */
async function deletePresetFromJournal(id) {
	await game.journal.get(id)?.delete();
}

/** @param {string} name @param {string} title @returns {object} */
function buildPresetSummaryPage(name, title) {
	return {
		name: name || title || "Battle Briefing",
		type: "text",
		text: {
			format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
			content: `<h1>${escapeHtml(title)}</h1>`,
		},
	};
}

/** @param {string} value @returns {string} */
function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Find scene tokens of the requested disposition which are not yet in the encounter.
 *
 * @param {Combat} combat
 * @param {number} disposition
 * @returns {TokenDocument[]}
 */
function getAvailableSceneTokens(combat, disposition) {
	const combatScene = combat?.scene;
	const scene = combatScene?.tokens
		? combatScene
		: game.scenes.get(combat?.sceneId ?? combatScene) ?? canvas.scene;
	if (!scene) {
		return [];
	}

	const existingTokenIds = new Set(Array.from(combat?.combatants ?? [])
		.filter((combatant) => combatant.sceneId === scene.id)
		.map((combatant) => combatant.tokenId));
	return Array.from(scene.tokens).filter((token) => token.actorId
		&& token.disposition === disposition
		&& !existingTokenIds.has(token.id));
}

/**
 * Capture the actor counts that identify an encounter without recording mutable combat state.
 *
 * @param {Combat|null} combat
 * @returns {Array<{actorId: string, name: string, count: number}>}
 */
function getExpectedCombatants(combat) {
	const expectedByActor = new Map();
	for (const combatant of combat?.combatants ?? []) {
		const actorId = combatant.actorId ?? combatant.token?.actorId;
		if (!actorId) {
			continue;
		}

		const expected = expectedByActor.get(actorId) ?? {
			actorId,
			name: combatant.actor?.name ?? combatant.name,
			count: 0,
		};
		expected.count += 1;
		expectedByActor.set(actorId, expected);
	}

	return Array.from(expectedByActor.values());
}

/**
 * Identify actor counts required by a preset that are absent from the current encounter.
 *
 * @param {Array<{actorId: string, name: string, count: number>}|undefined} expectedCombatants
 * @param {Combat|null} combat
 * @returns {Array<{actorId: string, name: string, count: number}>}
 */
function getMissingCombatants(expectedCombatants = [], combat) {
	const currentCounts = new Map(getExpectedCombatants(combat)
		.map((combatant) => [combatant.actorId, combatant.count]));

	return expectedCombatants.flatMap((expected) => {
		const missingCount = Number(expected.count) - (currentCounts.get(expected.actorId) ?? 0);
		return missingCount > 0 ? [{ ...expected, count: missingCount }] : [];
	});
}

/** @param {number} disposition @returns {string} */
function getDispositionClass(disposition) {
	if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
		return "is-friendly";
	}
	if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
		return "is-hostile";
	}

	return "is-neutral";
}

/**
 * Build the display-ready party roster.
 *
 * @param {Combat|null} combat
 * @returns {object}
 */
function getCombatStartRoster(combat) {
	const combatants = combat
		? Array.from(combat.combatants).filter((combatant) => !isCombatantHidden(combatant))
		: [];
	const party = combatants
		.filter((combatant) => combatant.actor?.hasPlayerOwner)
		.map((combatant) => ({
			...getCombatantData(combatant),
			rawInitiative: combatant.initiative == null ? "" : Math.round(combatant.initiative),
			hasInitiative: combatant.initiative != null,
		}));

	return {
		combatName: combat?.name ?? "Encounter",
		party,
		partyCount: party.length,
	};
}

/**
 * Build the initiative order shown in the shared Battle Briefing.
 *
 * Combatants hidden by the GM remain excluded so the player-facing briefing
 * does not reveal concealed enemies. Chips are ordered by Foundry's own turn
 * order (`combat.turns`) rather than by raw initiative value, since that is
 * the authoritative, unambiguous order — including however the system
 * breaks ties.
 *
 * @param {Combat|null} combat
 * @returns {{rolled: Array<object>, unrolled: Array<object>, hasRolled: boolean}}
 */
function getInitiativeTracker(combat, isGM = false) {
	const entries = Array.from(combat?.turns ?? combat?.combatants ?? [])
		.filter((combatant) => isGM || !isCombatantHidden(combatant))
		.map((combatant) => ({
			...getCombatantData(combatant),
			rawInitiative: combatant.initiative,
			isCurrent: combat?.combatant?.id === combatant.id,
			isPlayer: Boolean(combatant.actor?.hasPlayerOwner),
			dispositionClass: getDispositionClass(combatant.token?.disposition),
			isHidden: isCombatantHidden(combatant),
		}));

	const rolled = entries.filter((entry) => entry.rawInitiative != null);
	const unrolled = entries.filter((entry) => entry.rawInitiative == null);
	rolled.forEach((entry, index) => {
		entry.seq = index + 1;
	});

	return { rolled, unrolled, hasRolled: rolled.length > 0, count: entries.length };
}

/** @param {Combatant} combatant @returns {object} */
function getCombatantData(combatant) {
	return {
		id: combatant.id,
		name: combatant.name,
		img: combatant.actor?.img ?? combatant.img ?? combatant.token?.texture?.src ?? "icons/svg/mystery-man.svg",
		role: getActorRole(combatant.actor),
		publicRole: getPublicEnemyRole(combatant.actor),
		level: getActorLevel(combatant.actor),
		initiative: combatant.initiative == null ? "—" : Math.round(combatant.initiative),
	};
}

/** @param {Actor} actor @returns {number} */
function getActorLevel(actor) {
	return Number(actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? actor?.system?.level ?? 0);
}

/** @param {Actor} actor @returns {string} */
function getActorRole(actor) {
	const primaryRole = actor?.system?.details?.role?.primary;
	const secondaryRole = actor?.system?.details?.role?.secondary;
	if (primaryRole || secondaryRole) {
		const primaryLabel = CONFIG.DND4E?.creatureRole?.[primaryRole]?.label ?? primaryRole;
		const secondaryLabel = CONFIG.DND4E?.creatureRoleSecond?.[secondaryRole]?.label ?? secondaryRole;
		return [secondaryLabel, primaryLabel].filter(Boolean).join(" ");
	}

	return actor?.system?.details?.class ?? actor?.type ?? "Combatant";
}

/** @param {Combatant} combatant @returns {boolean} */
function isCombatantHidden(combatant) {
	return Boolean(combatant.hidden || combatant.token?.hidden);
}

/**
 * Return only enemy classifications useful to players before combat.
 *
 * @param {Actor} actor
 * @returns {string}
 */
function getPublicEnemyRole(actor) {
	const role = actor?.system?.details?.role;
	const labels = [];
	if (["elite", "minion", "solo"].includes(role?.secondary)) {
		labels.push(CONFIG.DND4E?.creatureRoleSecond?.[role.secondary]?.label ?? role.secondary);
	}
	if (role?.leader || role?.primary === "leader") {
		labels.push(game.i18n.localize("DND4E.Role.Leader"));
	}

	return labels.join(" · ");
}
