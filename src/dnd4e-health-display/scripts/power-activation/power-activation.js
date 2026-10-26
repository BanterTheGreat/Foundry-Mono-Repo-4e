import { CoverPreview } from "./cover-preview.js";
import { attackResults, messageAttackResults } from "./attack-results.js";
import { sharedAreaPreview } from "./shared-area-preview.js";
import { AREA_TYPES, areaRectangle, intersectsArea, closeBlastOrigin, areaTargetAllowed, areaRangeOrigin, wallGeometryProblems, hasLineOfEffect } from "./area-geometry.js";
import { MODULE_ID, SETTING, automationConfig, powerOriginRules, selectionProblems, targetCountProblems, squareDistance, targetFilterProblems } from "./rules.js";
import { registerActorOrigins } from "./actor-origins.js";
import { renderPowerCard, createPowerMessage, postAttackRules, preAttackRules } from "./cards.js";
import { loadSystem, resolveRange, registerAutomationTab, commitCardCosts, commitPowerUse, rollFromOrigin } from "./system-adapter.js";
import { rollDamageAndWait } from "./damage-roll.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
let session = null;
let starting = false;

/** Register the independent feature, not a HUD-owned preference. */
export function registerPowerActivationSettings() {
	game.settings.register(MODULE_ID, SETTING, {
		name: "Enable power target automation",
		hint: "Use Ability previews range, targets, and cover for powers enabled in their Automation tab. Invalid selections allow Proceed Anyway.",
		scope: "world", config: true, type: Boolean, default: false,
		onChange: enabled => {
			if (!enabled) {
				void session?.cancel();
			}
		},
	});
}

/** Register canvas/session lifecycle separately from any HUD class. */
export async function registerPowerActivation() {
	if (game.system.id !== "dnd4e") {
		return;
	}
	CoverPreview.register();
	registerActorOrigins();
	attackResults.register();
	sharedAreaPreview.register();
	Hooks.on("createChatMessage", message => session?.captureAttackResults(message));
	try {
		await registerAutomationTab();
	} catch (error) {
		console.error(`${MODULE_ID} | Could not extend the native power sheet`, error);
		ui.notifications.error("Power Automation tab could not load. See the browser console.");
	}
	Object.assign(game.modules.get(MODULE_ID), { powerActivation: { useAbility, showPowerInChat, cancel: () => session?.cancel() } });
	Hooks.on("targetToken", (user, token, targeted) => {
		if (user.id === game.user.id) {
			session?.targetChanged(token, targeted);
		}
	});
	Hooks.on("updateToken", () => session?.refreshAreaTargets());
	Hooks.on("refreshToken", token => session?.refreshMovingToken(token));
	Hooks.on("canvasPan", () => session?.drawRange());
	Hooks.on("sightRefresh", () => session?.drawRange());
	Hooks.on("lightingRefresh", () => session?.drawRange());
	Hooks.on("deleteToken", document => {
		if (session?.source.id === document.id || session?.caster.id === document.id) {
			void session.cancel();
		} else {
			session?.refreshAreaTargets();
		}
	});
	Hooks.on("deleteItem", item => {
		if (session?.item.uuid === item.uuid) {
			void session.cancel();
		}
	});
	for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createToken"]) {
		Hooks.on(hook, () => session?.refreshAreaTargets());
	}
	Hooks.on("updateActor", () => void session?.refreshRange());
	Hooks.on("updateItem", () => void session?.refreshRange());
	Hooks.on("canvasTearDown", () => void (session?.committed ? session.dispose(false) : session?.cancel()));
	Hooks.on("renderApplicationV2", app => session?.bindAttackDialog(app));
	Hooks.on("dnd4e.evaluateCommonAttackBonuses", (item, attacker, target, config) => session?.applyDetectedCover(item, target, config));
	// A disconnected client cannot delete immediately; only reconcile its own cards on reconnect.
	for (const message of game.messages) {
		if (message.isAuthor && message.getFlag(MODULE_ID, "powerActivation")?.provisional) {
			await deletePreview(message);
		}
	}
}

/** Preserve normal power use unless targeting automation is enabled for this ability. */
export async function showPowerInChat(item) {
	if (!game.settings.get(MODULE_ID, SETTING) || !automationConfig(item).enabled) {
		return item.actor.usePower(item);
	}
	const utils = await loadSystem();
	return createPowerMessage(item, await renderPowerCard(item, utils, { showActions: true }));
}

/**
 * Start an activation; returns false only when ordinary caller behavior should run.
 * Other HUDs/macros may call the same API with the exact source Token.
 */
export async function useAbility(item, sourceToken) {
	if (!game.settings.get(MODULE_ID, SETTING) || !automationConfig(item).enabled) {
		return false;
	}
	if (starting || session?.busy) {
		ui.notifications.warn("Finish or cancel the current ability first.");
		return true;
	}
	starting = true;
	try {
		await session?.cancel();
		if (!item.isOwner || !item.actor?.isOwner || !sourceToken || sourceToken.actor?.uuid !== item.actor.uuid || !canvas.ready || canvas.tokens.get(sourceToken.id) !== sourceToken) {
			throw new Error("Control an owned token on the current scene before using this ability.");
		}
		if ((automationConfig(item).placementMode !== "summon" && !["weapon", "melee", "touch", "reach", "range", ...AREA_TYPES].includes(item.system.rangeType)) || !canvas.grid.isSquare) {
			throw new Error("Target automation supports weapon, melee, melee touch/reach, ranged, close burst/blast, area burst/blast and wall powers on square grids.");
		}
		const config = automationConfig(item);
		if (config.placementMode === "summon" && (item.hasAttack || !config.summonActor)) {
			throw new Error("Summon mode requires a non-attack power and a configured summoned actor.");
		}
		const count = config.targetCount;
		if (config.placementMode !== "summon" && (!AREA_TYPES.includes(item.system.rangeType) || automationConfig(item).targetMode === "exact") && (!Number.isInteger(count) || count < 1)) {
			throw new Error("Set a positive whole Amount of Targets in this power's Automation tab.");
		}
		if (item.system.macros?.some(macro => macro.enabled)) {
			throw new Error("Powers with enabled use macros need the ordinary use workflow. Disable target automation for this power.");
		}
		const utils = await loadSystem();
		if (utils.tokenForActor(item.actor)?.id !== sourceToken.id) {
			throw new Error("Select only the source token for this actor so the system uses the same attacker as the range preview.");
		}
		const range = await resolveRange(item);
		const card = await renderPowerCard(item, utils);
		session = new ActivationSession(item, sourceToken, range, card, count);
		await session.start();
	} catch (error) {
		ui.notifications.error(error.message);
		console.error(`${MODULE_ID} | Ability activation`, error);
		await session?.cancel();
	} finally {
		starting = false;
	}
	return true;
}

/** Delete only a specific owned provisional message, tolerating permission/race failures. */
async function deletePreview(message) {
	try {
		if (game.messages.has(message.id) && message.canUserModify(game.user, "delete")) {
			await message.delete();
		} else if (game.messages.has(message.id)) {
			ui.notifications.warn("You cannot delete the temporary ability card. Ask the GM to remove it.");
		}
	} catch (error) {
		console.warn(`${MODULE_ID} | Provisional card cleanup`, error);
		ui.notifications.warn("The temporary ability card could not be deleted. Remove it from chat manually.");
	}
}

/** A disposable local session owns input, graphics, message and native-dialog handoff. */
class ActivationSession {
	constructor(item, source, range, card, count) {
		Object.assign(this, { item, source, range, card, count });
		this.caster = source;
		this.id = foundry.utils.randomID();
		this.previousTargets = [...game.user.targets];
		this.targets = [];
		this.areaExclusions = new Map();
		this.busy = false;
		this.finished = false;
		this.committed = false;
		this.syncing = false;
		this.listeners = new AbortController();
		this.placementLocked = range.shape === "closeBurst";
		this.wallCells = [];
		this.phase = "targeting";
		this.attackMessages = [];
	}

	/** Offer visible tokens from the effective origin rules, optionally including the caster. */
	originChoices() {
		const { originActors: allowed, allowCaster } = powerOriginRules(this.item);
		return [...(allowCaster ? [this.caster] : []), ...canvas.tokens.placeables.filter(token => token !== this.caster && token.visible
			&& token.actor && (allowed.includes(token.document.actorId ? `Actor.${token.document.actorId}` : token.actor.uuid)
				|| allowed.includes(token.actor._stats?.compendiumSource)))];
	}

	/** Revalidate the whitelist at handoff and submission, including deleted tokens. */
	originAllowed() {
		return this.originChoices().includes(this.source) && canvas.tokens.get(this.source.id) === this.source;
	}

	/** Changing origin resets placement and target selection, retaining the actual caster. */
	changeOrigin(id) {
		if (this.busy || this.finished) {
			return;
		}
		const token = this.originChoices().find(candidate => candidate.id === id);
		if (!token || token === this.source) {
			return;
		}
		this.source = token;
		this.origin = null;
		this.wallCells = [];
		this.wallHover = null;
		this.placementLocked = this.range.shape === "closeBurst";
		this.targets = [];
		if (this.range.shape) {
			this.selectAreaTargets();
		} else {
			this.syncTargets();
		}
		this.refresh();
	}

	/** Resolve permissions and prototype dimensions before spending any resources. */
	async prepareSummon() {
		if (this.item.hasAttack) {
			throw new Error("Summon placement requires a non-attack power.");
		}
		const uuid = automationConfig(this.item).summonActor;
		const actor = uuid ? await fromUuid(uuid) : null;
		if (actor?.pack) {
			throw new Error("Import the summoned actor into the Actors directory and configure that actor.");
		}
		if (!actor || actor.documentName !== "Actor" || !actor.isOwner || !TokenDocument.canUserCreate(game.user)) {
			throw new Error("Summoning requires an available owned actor and permission to create Tokens.");
		}
		const document = await actor.getTokenDocument({ x: this.origin.x, y: this.origin.y,
			elevation: this.source.document.elevation, disposition: this.caster.document.disposition });
		const data = document.toObject();
		const map = canvas.dimensions.sceneRect;
		if (data.x < map.x || data.y < map.y || data.x + data.width * canvas.grid.size > map.x + map.width
			|| data.y + data.height * canvas.grid.size > map.y + map.height) {
			throw new Error("The summoned token's footprint must fit on the scene.");
		}
		this.summonData = data;
	}

	/** Create once after confirmation; a failed creation must not skip use bookkeeping. */
	async placeSummon() {
		if (this.range.shape !== "summon" || this.summonAttempted) {
			return;
		}
		this.summonAttempted = true;
		try {
			const tokens = await canvas.scene.createEmbeddedDocuments("Token", [this.summonData]);
			if (!tokens.length) {
				throw new Error("Token creation was prevented.");
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Summon creation`, error);
			ui.notifications.warn(`The power is being used, but its summon could not be placed: ${error.message}`);
		}
	}

	/** Retain in-range direct targets and install the session cancellation shortcut. */
	async start() {
		const choices = this.originChoices();
		if (!choices.length) {
			throw new Error("No eligible origin is on this scene. Place a companion configured in this power's Custom origins.");
		}
		if (!choices.includes(this.source)) {
			this.source = choices[0];
		}
		this.message = await createPowerMessage(this.item, this.card, this.id);
		if (!this.message) {
			throw new Error("Could not create the temporary ability card.");
		}
		if (this.finished) {
			await deletePreview(this.message);
			return;
		}
		if (!this.range.shape) {
			this.targets = this.previousTargets.filter(token => canvas.tokens.get(token.id) === token
				&& token.actor && token.visible
				&& squareDistance(this.source, token, canvas.grid.size) <= this.range.maximum);
		}
		this.syncTargets();
		this.panel = new TargetingPanel(this);
		if (this.range.shape) {
			if (this.range.shape !== "closeBurst") {
				this.installPlacement();
			}
			this.selectAreaTargets();
		}
		const options = { capture: true, signal: this.listeners.signal };
		window.addEventListener("keydown", event => {
			if (event.key === "Escape" && !this.busy) {
				event.stopImmediatePropagation();
				void this.cancel();
			}
		}, options);
		this.refresh();
	}

	/** Capture canvas clicks only while an area is being placed; keep right-drag panning. */
	installPlacement() {
		const element = canvas.app?.view;
		if (!element?.addEventListener) {
			throw new Error("The canvas view is unavailable. Wait for the scene to finish loading and try again.");
		}
		const options = { capture: true, signal: this.listeners.signal };
		const position = event => {
			const bounds = element.getBoundingClientRect();
			return canvas.stage.toLocal(new PIXI.Point(event.clientX - bounds.left, event.clientY - bounds.top));
		};
		const move = event => {
			if (this.busy || this.finished || this.placementLocked) {
				return;
			}
			const point = position(event);
			if (this.range.shape === "wall") {
				const size = canvas.grid.size;
				const offset = canvas.dimensions.sceneRect;
				this.wallHover = { x: offset.x + Math.floor((point.x - offset.x) / size) * size,
					y: offset.y + Math.floor((point.y - offset.y) / size) * size };
				if (event.buttons === 1) {
					this.addWallSquare();
				} else {
					this.drawRange();
				}
				return;
			}
			const size = canvas.grid.size;
			const offset = canvas.dimensions.sceneRect;
			const origin = this.range.shape === "closeBlast" ? closeBlastOrigin(this.source, point, this.range.area, size)
				: { x: offset.x + Math.floor((point.x - offset.x) / size) * size, y: offset.y + Math.floor((point.y - offset.y) / size) * size };
			if (this.origin?.x === origin.x && this.origin?.y === origin.y) {
				return;
			}
			this.origin = origin;
			this.selectAreaTargets();
			this.refresh();
		};
		element.addEventListener("pointermove", move, options);
		for (const name of ["pointerdown", "pointerup", "click", "dblclick"]) {
			element.addEventListener(name, event => {
				if (this.busy || this.finished || this.placementLocked || event.button !== 0) {
					return;
				}
				event.preventDefault();
				event.stopImmediatePropagation();
				if (this.range.shape === "wall") {
					if (name === "pointerdown") {
						move(event);
						this.addWallSquare();
					}
					return;
				}
				if (name === "click") {
					move(event);
					if (this.lineOfEffectProblems().length) {
						ui.notifications.warn(this.lineOfEffectProblems().join(" "));
						return;
					}
					this.placementLocked = true;
					this.refresh();
				}
			}, options);
		}
	}

	/** The same occupied squares drive wall drawing, targeting and Region persistence. */
	areaRectangles() {
		if (this.range.shape === "wall") {
			return this.wallCells.map(cell => ({ ...cell, w: canvas.grid.size, h: canvas.grid.size }));
		}
		const bounds = this.areaBounds();
		return bounds ? [bounds] : [];
	}

	/** Players must reach each placed square through physical walls; GMs may adjudicate exceptions. */
	lineOfEffectProblems(cells = null) {
		if (game.user.isGM || !this.range.shape || this.range.shape === "closeBurst") {
			return [];
		}
		const size = canvas.grid.size;
		const origin = areaRangeOrigin(this.source, this.range, this.origin, size);
		const destinations = cells ?? (this.range.shape === "wall" ? this.wallCells
			: this.range.shape === "closeBlast" ? this.areaRectangles() : origin ? [origin] : []);
		const walls = (canvas.walls?.placeables ?? []).map(wall => wall.document)
			.filter(wall => wall.move !== CONST.WALL_MOVEMENT_TYPES.NONE && wall.ds !== CONST.WALL_DOOR_STATES.OPEN)
			.map(wall => wall.c);
		return destinations.some(destination => !hasLineOfEffect(this.source, destination, size, walls))
			? ["Placement requires line of effect from the attack origin."] : [];
	}

	/** Reject invalid placement without revealing hidden occupying creatures to players. */
	wallProblems(cells = this.wallCells) {
		const size = canvas.grid.size;
		const config = automationConfig(this.item);
		const problems = wallGeometryProblems(cells, this.range.area, size);
		problems.push(...this.lineOfEffectProblems(cells));
		const map = canvas.dimensions.sceneRect;
		if (cells.some(cell => cell.x < map.x || cell.y < map.y || cell.x + size > map.x + map.width || cell.y + size > map.y + map.height)) {
			problems.push("Wall squares must be on the scene.");
		}
		if (cells.some(cell => squareDistance(this.source, { ...cell, w: size, h: size }, size) > this.range.maximum)) {
			problems.push(`Every wall square must be within range ${this.range.maximum}.`);
		}
		if (!Number.isInteger(config.wallHeight) || config.wallHeight < 1) {
			problems.push("Set a positive whole wall height in the Automation tab.");
		}
		if (config.wallSolid && cells.some(cell => canvas.tokens.placeables.some(token =>
			(game.user.isGM || token.visible) && Number(token.document.elevation) === Number(this.source.document.elevation)
			&& intersectsArea(token, { ...cell, w: size, h: size })))) {
			problems.push("Solid walls require unoccupied squares at the caster's elevation.");
		}
		return problems;
	}

	/** Append only a legal square; skipped pointer squares are never filled implicitly. */
	addWallSquare() {
		if (!this.wallHover || this.wallCells.some(cell => cell.x === this.wallHover.x && cell.y === this.wallHover.y)) {
			return;
		}
		const cells = [...this.wallCells, this.wallHover];
		this.wallHint = this.wallProblems(cells)[0] ?? "";
		if (!this.wallHint) {
			this.wallCells = cells;
			this.origin = cells[0];
			this.selectAreaTargets();
		}
		this.refresh();
	}

	/** Undo preserves connected drawing history; clear starts a new origin. */
	editWall(clear = false) {
		if (this.busy) {
			return;
		}
		this.wallCells = clear ? [] : this.wallCells.slice(0, -1);
		this.origin = this.wallCells[0];
		this.wallHint = "";
		this.selectAreaTargets();
		this.refresh();
	}

	/** The selected area remains distinct from the caster's placement range. */
	areaBounds() {
		return areaRectangle(this.source, this.range, this.origin, canvas.grid.size);
	}

	/** Identify the placement and creature footprint at the time of a manual exclusion. */
	areaSelectionKey(token) {
		return JSON.stringify([this.source.id, this.range.shape, this.areaRectangles(),
			token.x, token.y, token.w, token.h, token.document.elevation]);
	}

	/** Remember manual removal until this area or this creature moves. */
	excludeAreaTarget(token) {
		if (this.range.shape && token) {
			this.areaExclusions.set(token.id, this.areaSelectionKey(token));
		}
	}

	/** Explicit re-selection resets exclusions; automatic updates preserve stationary removals. */
	selectAreaTargets(resetExclusions = true) {
		if (resetExclusions) {
			this.areaExclusions.clear();
		}
		const config = automationConfig(this.item);
		const rectangles = this.range.shape === "summon" ? [] : this.areaRectangles();
		const candidates = canvas.tokens.placeables.filter(token => rectangles.some(bounds => intersectsArea(token, bounds))
			&& areaTargetAllowed(this.caster, token, this.range, config, this.source)
			&& !targetFilterProblems(token, config, canvas.tokens.placeables, canvas.grid.size).length);
		for (const [id, key] of this.areaExclusions) {
			const token = candidates.find(candidate => candidate.id === id);
			if (!token || this.areaSelectionKey(token) !== key) {
				this.areaExclusions.delete(id);
			}
		}
		this.targets = candidates.filter(token => !this.areaExclusions.has(token.id));
		this.syncTargets();
	}

	/** Keep caster-centered bursts current when tokens or power configuration change. */
	refreshAreaTargets() {
		if (this.finished || this.busy || this.phase !== "targeting") {
			return;
		}
		if (AREA_TYPES.includes(this.range.shape) && automationConfig(this.item).targetMode === "area") {
			this.selectAreaTargets(false);
		}
		this.refresh();
	}

	/** Validate area membership rather than distance from caster to individual targets. */
	areaProblems(targets = this.targets, checkCount = true) {
		const problems = this.lineOfEffectProblems();
		const config = automationConfig(this.item);
		const origin = areaRangeOrigin(this.source, this.range, this.origin, canvas.grid.size);
		if (this.range.shape === "wall") {
			problems.push(...this.wallProblems());
		} else if (!this.placementLocked) {
			problems.push("Click the canvas to lock the area placement.");
		}
		if (this.origin && this.range.shape === "closeBlast") {
			const extent = this.range.area * canvas.grid.size;
			const legal = closeBlastOrigin(this.source, { x: this.origin.x + extent / 2, y: this.origin.y + extent / 2 }, this.range.area, canvas.grid.size);
			if (legal.x !== this.origin.x || legal.y !== this.origin.y) {
				problems.push("The close blast is no longer adjacent to the caster; reposition it.");
			}
		}
		if (origin && (this.range.shape.startsWith("range") || this.range.shape === "summon") && squareDistance(this.source,
			{ ...origin, w: canvas.grid.size, h: canvas.grid.size }, canvas.grid.size) > this.range.maximum) {
			problems.push(`Area origin is outside range ${this.range.maximum}.`);
		}
		if (this.range.shape !== "summon" && checkCount && config.targetMode === "exact") {
			problems.push(...targetCountProblems(targets.length, this.count, config.targetCountMode));
		}
		if (checkCount && !targets.length && this.item.hasAttack && this.range.shape !== "summon") {
			problems.push("No targets selected.");
		}
		for (const token of targets) {
			if (!areaTargetAllowed(this.caster, token, this.range, config, this.source) || !this.areaRectangles().some(bounds => intersectsArea(token, bounds))) {
				problems.push(`${token.visible ? token.name : "Unavailable target"} is outside the area or target filter.`);
			}
			if (Number(token.document.elevation) !== Number(this.source.document.elevation)) {
				problems.push(`${token.visible ? token.name : "Unavailable target"} has a different elevation; check the area manually.`);
			}
		}
		return problems;
	}

	/** Follow Foundry's standard targeting controls. */
	targetChanged(token, targeted) {
		if (this.syncing || this.finished || this.phase !== "targeting") {
			return;
		}
		if (this.busy) {
			this.syncTargets();
			return;
		}
		this.targets = [...game.user.targets];
		if (this.range.shape) {
			if (targeted) {
				this.areaExclusions.delete(token.id);
			} else {
				this.excludeAreaTarget(token);
			}
			this.refresh();
			return;
		}
		if (targeted) {
			const problems = selectionProblems(this.source, [token], this.range, 1, canvas.grid.size);
			if (this.targets.length > this.count) {
				problems.push(`This power expects ${this.count} targets.`);
			}
			if (problems.length) {
				ui.notifications.warn(problems.join(" "));
			}
		}
		this.refresh();
	}

	/** Keep global targets stable for DnD4e's multiple reads while a dialog is open. */
	syncTargets(targets = this.targets) {
		this.syncing = true;
		try {
			for (const token of [...game.user.targets]) {
				if (!targets.includes(token)) {
					token.setTarget(false, { releaseOthers: false });
				}
			}
			for (const token of targets) {
				if (canvas.tokens.get(token.id) && token.visible) {
					token.setTarget(true, { releaseOthers: false });
				}
			}
		} finally {
			this.syncing = false;
		}
	}

	/** Report mandatory per-power requirements for any selection workflow. */
	filterProblems(targets = this.targets) {
		const config = automationConfig(this.item);
		return targets.flatMap(token => targetFilterProblems(token, config, canvas.tokens.placeables, canvas.grid.size));
	}

	/** Build advisory errors; unavailable targets remain in the panel until removed. */
	problems() {
		if (this.range.shape) {
			return [...this.areaProblems(), ...this.filterProblems()];
		}
		return [...selectionProblems(this.source, this.targets, this.range, this.count, canvas.grid.size, automationConfig(this.item).targetCountMode), ...this.filterProblems()];
	}

	/** Re-evaluate formulas and weapon defaults when actor/item data changes. */
	async refreshRange() {
		if (this.finished || this.busy || this.phase !== "targeting") {
			return;
		}
		try {
			const range = await resolveRange(this.item);
			if (range.shape !== this.range.shape) {
				throw new Error("The power's targeting shape changed. Start Use Ability again.");
			}
			this.range = range;
			this.count = automationConfig(this.item).targetCount;
			if (((this.range.shape !== "summon" && (!this.range.shape || automationConfig(this.item).targetMode === "exact")) && (!Number.isInteger(this.count) || this.count < 1)) || !automationConfig(this.item).enabled) {
				throw new Error("The power's automation configuration changed. Start Use Ability again after configuring it.");
			}
			this.refreshAreaTargets();
		} catch (error) {
			ui.notifications.warn(error.message);
			await this.cancel();
		}
	}

	/** Redraw the square and panel from current token documents. */
	refresh() {
		if (this.finished) {
			return;
		}
		if (this.phase === "results") {
			this.panel?.render({ force: true });
			return;
		}
		if (!this.item.isOwner || !this.item.actor?.isOwner || !this.originAllowed()) {
			void this.cancel();
			return;
		}
		// Cover shares the targeting lifecycle and resolved attack mode.
		CoverPreview.setContext(this.busy || !this.item.hasAttack ? null : {
			source: this.source, caster: this.caster, targets: [...this.targets], mode: this.range.mode,
		});
		this.drawRange();
		this.panel?.render({ force: true });
	}

	/** Follow rendered token positions throughout movement without rebuilding the panel each frame. */
	refreshMovingToken(token) {
		const automaticArea = AREA_TYPES.includes(this.range.shape) && automationConfig(this.item).targetMode === "area";
		if (this.finished || this.phase !== "targeting" || (!automaticArea && token !== this.source && !this.targets.includes(token))) {
			return;
		}
		if (token === this.source) {
			this.drawRange();
		}
		window.clearTimeout(this.movementTimer);
		this.movementTimer = window.setTimeout(() => this.refreshAreaTargets(), 100);
	}

	/** Draw around the source's current canvas position, including interpolated movement. */
	drawRange() {
		if (this.finished || this.phase !== "targeting") {
			return;
		}
		if (this.range.shape && !this.busy) {
			sharedAreaPreview.show(this);
		} else {
			sharedAreaPreview.clear();
		}
		this.graphics ??= canvas.interface.addChild(new PIXI.Graphics());
		this.graphics.eventMode = "none";
		this.graphics.clear();
		this.refreshRangeMask();
		if (!this.busy) {
			if (this.range.shape) {
				if (this.range.shape.startsWith("range") || ["wall", "summon"].includes(this.range.shape)) {
					this.drawRangeBoundary(this.range.maximum, 0xf5d787, false);
				}
				if (this.range.shape === "wall") {
					for (const cell of this.areaRectangles()) {
						this.graphics.lineStyle(2, 0xf5d787).beginFill(0xf5d787, .18).drawRect(cell.x, cell.y, cell.w, cell.h).endFill();
					}
					if (this.origin) {
						this.graphics.lineStyle(3, 0xffffff).drawRect(this.origin.x, this.origin.y, canvas.grid.size, canvas.grid.size);
					}
					if (this.wallHover) {
						const occupied = this.wallCells.some(cell => cell.x === this.wallHover.x && cell.y === this.wallHover.y);
						const color = occupied ? 0xf5d787 : (this.wallProblems([...this.wallCells, this.wallHover]).length ? 0xdd5555 : 0x77cc88);
						this.graphics.lineStyle(2, color).drawRect(this.wallHover.x, this.wallHover.y, canvas.grid.size, canvas.grid.size);
					}
					return;
				}
				const bounds = this.areaBounds();
				if (bounds) {
					this.graphics.lineStyle(2, 0xf5d787).beginFill(0xf5d787, .18).drawRect(bounds.x, bounds.y, bounds.w, bounds.h);
					if (this.range.shape === "closeBurst" && !automationConfig(this.item).includeCaster) {
						this.graphics.beginHole().drawRect(this.source.x, this.source.y, this.source.w, this.source.h).endHole();
					}
					this.graphics.endFill();
					if (this.range.shape.startsWith("range")) {
						const origin = areaRangeOrigin(this.source, this.range, this.origin, canvas.grid.size);
						this.graphics.lineStyle(2, 0xffffff).drawRect(origin.x, origin.y, canvas.grid.size, canvas.grid.size);
					}
				}
				return;
			}
			this.drawRangeFill();
			if (this.range.maximum > this.range.normal) {
				this.drawRangeBoundary(this.range.maximum, 0x9fc5e4, true);
			}
			this.drawRangeBoundary(this.range.normal, 0xf5d787, false);
		}
	}

	/**
	 * Clip the entire overlay, including borders, to the unpadded map
	 * and the active sight of the attack origin, falling back to the caster's sight.
	 * Lit areas also require that vision source's light-perception LOS.
	 * Never use the union of other controlled tokens' vision or previously explored fog.
	 */
	refreshRangeMask() {
		this.rangeMask ??= canvas.interface.addChild(new PIXI.Graphics());
		this.rangeMask.eventMode = "none";
		this.rangeMask.clear();
		this.graphics.mask = this.rangeMask;
		const bounds = canvas.dimensions?.sceneRect;
		if (!bounds) {
			return;
		}
		const map = new PIXI.Polygon([
			bounds.x, bounds.y, bounds.x + bounds.width, bounds.y,
			bounds.x + bounds.width, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height,
		]);
		const draw = (polygon, constraint) => {
			if (!polygon?.points?.length) {
				return;
			}
			// Polygon.intersectPolygon/intersectRectangle return a single polygon.
			// Preserve every disconnected component (and holes) through both clips.
			let tree = new foundry.data.PolygonTree().intersectPolygon(polygon, {
				clipType: ClipperLib.ClipType.ctUnion,
			});
			if (constraint) {
				tree = tree.intersectPolygon(constraint);
			}
			tree = tree.intersectPolygon(map);
			this.rangeMask.beginFill(0xffffff);
			tree.drawShape(this.rangeMask);
			this.rangeMask.endFill();
		};
		if (!canvas.scene.tokenVision) {
			this.rangeMask.beginFill(0xffffff).drawRect(bounds.x, bounds.y, bounds.width, bounds.height).endFill();
			return;
		}
		const vision = this.source.vision?.active ? this.source.vision : this.caster.vision;
		if (!vision?.active) {
			return;
		}
		draw(vision.shape);
		if (vision.visionMode?.perceivesLight && vision.light) {
			for (const light of canvas.effects.lightSources.values()) {
				if (light.active && light.shape) {
					draw(light.shape, vision.light);
				}
			}
		}
	}

	/** Tint normal range and the surrounding long-range band without overlapping colours. */
	drawRangeFill() {
		const normal = this.range.normal * canvas.grid.size;
		const maximum = this.range.maximum * canvas.grid.size;
		const x = this.source.x - normal;
		const y = this.source.y - normal;
		const width = this.source.w + 2 * normal;
		const height = this.source.h + 2 * normal;
		this.graphics.lineStyle(0).beginFill(0xf5d787, .10)
			.drawRect(x, y, width, height).endFill();
		if (maximum > normal) {
			const band = maximum - normal;
			const outerWidth = this.source.w + 2 * maximum;
			this.graphics.beginFill(0x9fc5e4, .07)
				.drawRect(x - band, y - band, outerWidth, band)
				.drawRect(x - band, y + height, outerWidth, band)
				.drawRect(x - band, y, band, height)
				.drawRect(x + width, y, band, height).endFill();
		}
	}

	/** Keep soft borders readable at every canvas zoom. */
	drawRangeBoundary(range, color, dashed) {
		const zoom = canvas.stage.scale.x;
		const padding = range * canvas.grid.size;
		const x = this.source.x - padding;
		const y = this.source.y - padding;
		const width = this.source.w + 2 * padding;
		const height = this.source.h + 2 * padding;
		for (const [weight, stroke] of [[1.5, color]]) {
			this.graphics.lineStyle(weight / zoom, stroke, .75);
			if (dashed) {
				for (const [sx, sy, dx, dy, length] of [
					[x, y, 1, 0, width], [x + width, y, 0, 1, height],
					[x + width, y + height, -1, 0, width], [x, y + height, 0, -1, height],
				]) {
					for (let offset = 0; offset < length; offset += 14 / zoom) {
						const end = Math.min(offset + 8 / zoom, length);
						this.graphics.moveTo(sx + dx * offset, sy + dy * offset)
							.lineTo(sx + dx * end, sy + dy * end);
					}
				}
			} else {
				this.graphics.drawRect(x, y, width, height);
			}
		}
	}

	/** Allow explicit player overrides for range/count warnings. */
	async confirmProblems() {
		const blocked = [...this.lineOfEffectProblems(), ...this.filterProblems()];
		if (blocked.length) {
			ui.notifications.warn(blocked.join(" "));
			return false;
		}
		const problems = this.problems();
		if (!problems.length) {
			return true;
		}
		const escape = Handlebars.escapeExpression;
		return DialogV2.confirm({
			window: { title: "Check ability targets" },
			content: `<p>${problems.map(problem => escape(problem)).join("<br>")}</p>`,
			yes: { label: "Proceed Anyway" }, no: { label: "Return to Targeting" }, rejectClose: false, defaultYes: false,
		});
	}

	/** Snapshot factors that affect native target tabs and automatically computed bonuses. */
	contextKey() {
		return JSON.stringify([this.caster.document.toObject(), this.range, this.origin, this.wallCells, automationConfig(this.item), this.item.toObject(), this.item.actor.toObject(), this.source.document.toObject(), this.targets.map(token => [token.id, token.document.toObject(), token.actor?.toObject()]), this.filterProblems()]);
	}

	/** Confirm utility use or open the native attack dialog after reviewing targets. */
	async attack() {
		if (this.busy || this.finished || this.phase !== "targeting") {
			return;
		}
		if (this.range.shape === "wall" && this.wallProblems().length) {
			ui.notifications.warn(this.wallProblems().join(" "));
			return;
		}
		if (this.range.shape && this.range.shape !== "wall" && !this.placementLocked) {
			ui.notifications.warn("Place and lock the area before using this ability.");
			return;
		}
		if (!this.originAllowed()) {
			ui.notifications.warn("The selected origin is no longer allowed.");
			return;
		}
		this.busy = true;
		this.refresh();
		try {
			if (this.targets.some(token => !token.visible || !token.actor || canvas.tokens.get(token.id) !== token)) {
				throw new Error("Remove unavailable targets before using this ability.");
			}
			const utils = await loadSystem();
			if (utils.tokenForActor(this.item.actor)?.id !== this.caster.id) {
				throw new Error("The system's source token changed. Select the original source before using this ability.");
			}
			this.range = await resolveRange(this.item);
			if (this.finished) {
				return;
			}
			if (this.range.shape === "wall" && this.wallProblems().length) {
				throw new Error(this.wallProblems().join(" "));
			}
			const reviewKey = this.contextKey();
			if (!await this.confirmProblems() || this.finished) {
				return;
			}
			if (this.contextKey() !== reviewKey) {
				ui.notifications.warn("The ability or battlefield changed. Review targets again.");
				return;
			}
			if (this.lineOfEffectProblems().length) {
				throw new Error(this.lineOfEffectProblems().join(" "));
			}
			if (this.range.shape === "wall" && this.wallProblems().length) {
				throw new Error(this.wallProblems().join(" "));
			}
			this.syncTargets();
			this.confirmedKey = this.contextKey();
			if (!this.item.hasAttack) {
				await this.submitUtility();
				if (this.committed) {
					await this.complete();
				}
				return;
			}
			// 0.9.3 inverts modifier behavior when fast-forward is the user's default.
			const shiftKey = Boolean(game.settings.get("dnd4e", "fastFowardSettings"));
			const options = {
				event: { shiftKey, clientY: 160 }, powerActivationSession: this.id,
				flags: { [MODULE_ID]: { attackResults: {
					sessionId: this.id, sceneId: canvas.scene.id, targetIds: this.targets.map(token => token.id),
				} } },
			};
			await (this.source === this.caster ? this.item.rollAttack(options) : rollFromOrigin(this.item, this.source, options));
			if (this.attackRolled && !this.finished) {
				await this.waitForAttackAnimation();
			}
			if (this.committed && !this.finished) {
				await this.complete({ keepOpen: Boolean(this.attackRolled) });
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Attack activation`, error);
			ui.notifications.error(`Ability activation: ${error.message}`);
			if (this.commitStarted) {
				// Side effects/rolls may already exist: do not offer a blind duplicate retry.
				this.committed = true;
				await this.complete();
			}
		} finally {
			this.busy = false;
			this.refresh();
		}
	}

	/** Commit a non-attack power once, after targeting, without calling a roll method. */
	async submitUtility() {
		if (this.finished || !this.item.isOwner || !this.item.actor?.isOwner) {
			throw new Error("You no longer have permission to use this power.");
		}
		if (this.range.shape === "summon") {
			await this.prepareSummon();
			if (!this.originAllowed() || this.contextKey() !== this.confirmedKey) {
				throw new Error("The ability or battlefield changed. Review the summon placement again.");
			}
		}
		if (this.lineOfEffectProblems().length) {
			throw new Error(this.lineOfEffectProblems().join(" "));
		}
		this.commitStarted = true;
		if (!await commitCardCosts(this.item)) {
			this.commitStarted = false;
			return;
		}
		await this.finalizePowerUse();
	}

	/** Apply the native use count, use effects and hook once a power has committed. */
	async finalizePowerUse() {
		this.committed = true;
		await this.placeSummon();
		await this.placeAreaRegion();
		await commitPowerUse(this.item);
		if (game.settings.get("dnd4e", "autoApplyEffects")) {
			const utils = await loadSystem();
			await utils.applyEffectsToTokens(this.item.effects, [this.caster], "self", this.item.actor);
			await utils.applyAllXEffectsToTokens(this.item.effects, this.item.actor, new Set(this.targets));
		}
		Hooks.callAll("dnd4e.usePower", this.item, ChatMessage.getSpeaker({ actor: this.item.actor }));
	}

	/** Persist the selected geometry once; Region failures must not interrupt power costs/effects. */
	async placeAreaRegion() {
		if (this.regionAttempted || !this.range.shape || this.range.shape === "summon" || !automationConfig(this.item).placeRegion) {
			return;
		}
		this.regionAttempted = true;
		try {
			const rectangles = this.areaRectangles();
			if (!rectangles.length) {
				throw new Error("No selected area is available.");
			}
			const rectangle = ({ x, y, w, h }, hole = false) => ({
				type: "rectangle", x, y, width: w, height: h, rotation: 0, hole,
			});
			const shapes = rectangles.map(bounds => rectangle(bounds));
			if (this.range.shape === "closeBurst" && !automationConfig(this.item).includeCaster) {
				shapes.push(rectangle(this.source, true));
			}
			const regions = await canvas.scene.createEmbeddedDocuments("Region", [{
				name: this.item.name, shapes,
				flags: { [MODULE_ID]: { wall: this.range.shape === "wall" ? {
					origin: this.origin, heightSquares: automationConfig(this.item).wallHeight,
					elevation: Number(this.source.document.elevation), solid: automationConfig(this.item).wallSolid,
				} : null } },
				color: String(game.user.color ?? "#f5d787"),
				levels: canvas.level ? [canvas.level.id] : [],
				visibility: CONST.REGION_VISIBILITY.ALWAYS,
				ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
			}]);
			if (!regions.length) {
				throw new Error("Region creation was prevented.");
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Area Region creation`, error);
			ui.notifications.warn(`The power is being used, but its Region could not be placed: ${error.message}`);
		}
	}

	/** Seed native per-target checkboxes while preserving stronger status/macro cover. */
	applyDetectedCover(item, target, { bonuses }) {
		if (!this.busy || this.finished || this.phase !== "targeting" || item?.uuid !== this.item.uuid
			|| !this.targets.includes(target)) {
			return;
		}
		const result = CoverPreview.evaluate(this.source, target, this.range.mode);
		if (result?.kind === "superior") {
			bonuses.coverSup.shouldApply = true;
		}
		if (result?.kind === "cover" && !bonuses.coverSup.shouldApply) {
			bonuses.cover.shouldApply = true;
		}
		if (bonuses.coverSup.shouldApply && ["cover", "superior"].includes(result?.kind)) {
			bonuses.cover.shouldApply = false;
		}
	}

	/** Wrap only this session's native callback, preserving other modules' roll hooks. */
	bindAttackDialog(app) {
		if (app.rollConfig?.options?.powerActivationSession !== this.id || app.powerActivationBound) {
			return;
		}
		app.powerActivationBound = true;
		this.dialog = app;
		const callback = app.callbackFn;
		let submission;
		app.callbackFn = (...args) => {
			submission ??= this.submitAttack(callback, args);
			return submission;
		};
	}

	/** Commit once, and always resolve the native dialog even if an adapter step fails. */
	async submitAttack(callback, args) {
		try {
			if (this.finished || !this.item.isOwner || !this.item.actor?.isOwner) {
				return false;
			}
			const system = await loadSystem();
			if (system.tokenForActor(this.item.actor)?.id !== this.caster.id || canvas.tokens.get(this.source.id) !== this.source) {
				ui.notifications.warn("The source token changed. Review targets and reopen the attack dialog.");
				return false;
			}
			if (!this.originAllowed() || this.contextKey() !== this.confirmedKey) {
				ui.notifications.warn("The ability or battlefield changed. Review targets and open the attack dialog again.");
				return false;
			}
			if (this.range.shape === "wall" && this.wallProblems().length) {
				ui.notifications.warn("The wall placement is no longer valid. Review it before attacking.");
				return false;
			}
			if (this.lineOfEffectProblems().length) {
				ui.notifications.warn(this.lineOfEffectProblems().join(" "));
				return false;
			}
			this.syncTargets();
			if (this.item.system.uses?.per && Number(this.item.system.uses.value) <= 0) {
				throw new Error("This power has no uses remaining.");
			}
			this.commitStarted = true;
			if (!await commitCardCosts(this.item)) {
				this.commitStarted = false;
				return false;
			}
			const roll = await callback(...args);
			if (roll) {
				this.attackRolled = true;
				await this.finalizePowerUse();
			} else {
				this.committed = true;
				ui.notifications.warn("The system returned no attack result after resource processing. Check chat and resources before using the power again.");
			}
			return roll;
		} catch (error) {
			console.error(`${MODULE_ID} | Attack submission`, error);
			ui.notifications.error(`Attack submission failed: ${error.message}. Check chat and resources before retrying.`);
			if (this.commitStarted) {
				this.committed = true;
			}
			return false;
		}
	}

	/** Wait for every attack message's local dice animation, including skipped or disabled dice. */
	async waitForAttackAnimation() {
		const dice3d = game.dice3d;
		if (typeof dice3d?.waitFor3DAnimationByMessageID !== "function") {
			return;
		}
		this.waitingForDice = true;
		this.refresh();
		try {
			await Promise.all(this.attackMessages.map(async message => {
				try {
					await dice3d.waitFor3DAnimationByMessageID(message.id);
				} catch (error) {
					console.warn(`${MODULE_ID} | Could not wait for Dice So Nice; showing attack results`, error);
				}
			}));
		} finally {
			this.waitingForDice = false;
		}
	}

	/** Finalize the chat card, retaining the panel only for a successful attack's damage step. */
	async complete({ keepOpen = false } = {}) {
		try {
			if (this.message && game.messages.has(this.message.id)) {
				const content = await renderPowerCard(this.item, await loadSystem(), { showActions: true });
				await this.message.update({ content, [`flags.${MODULE_ID}.powerActivation.provisional`]: false });
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Could not finalize played power card`, error);
			ui.notifications.warn("The ability finished, but its power card could not be finalized. Check chat before reloading.");
		} finally {
			if (keepOpen && !this.finished) {
				this.phase = "results";
				this.listeners.abort();
				sharedAreaPreview.clear();
				CoverPreview.setContext(null);
				this.graphics?.clear();
				// PIXI still processes masks on empty graphics; detach before destroying geometry.
				if (this.graphics) {
					this.graphics.mask = null;
				}
				this.rangeMask?.destroy();
				this.rangeMask = null;
			} else {
				await this.dispose(false);
			}
		}
	}

	/** Retain only this session's chat results; visibility is rechecked when rendering. */
	captureAttackResults(message) {
		if (message.flags?.[MODULE_ID]?.attackResults?.sessionId === this.id) {
			this.attackMessages.push(message);
			if (this.phase === "results") {
				this.refresh();
			}
		}
	}

	/** Allow skipping damage only when every confirmed target has a known miss result. */
	canComplete() {
		if (this.phase !== "results" || this.busy) {
			return false;
		}
		if (this.damageRolled || !this.item.hasDamage) {
			return true;
		}
		const results = this.attackMessages.flatMap(message => messageAttackResults(message, canvas.scene?.id));
		return this.targets.length > 0
			&& this.targets.every(token => results.some(result => result.tokenId === token.id))
			&& results.every(result => ["miss", "fumble"].includes(result.outcome));
	}

	/** Roll once for the whole attack; cancelling the native dialog leaves damage available. */
	async rollDamage(event) {
		if (this.busy || this.finished || this.phase !== "results" || this.damageRolled || !this.item.hasDamage) {
			return;
		}
		this.busy = true;
		this.refresh();
		try {
			if (!this.item.isOwner || !this.item.actor?.isOwner) {
				throw new Error("You no longer have permission to roll this power's damage.");
			}
			const roll = await rollDamageAndWait(this.item, event);
			if (roll) {
				this.damageRolled = true;
				this.damageTotal = Number.isFinite(roll.total) ? roll.total : null;
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Damage activation`, error);
			ui.notifications.error(`Damage roll failed: ${error.message}`);
		} finally {
			this.busy = false;
			this.refresh();
		}
	}

	/** Explicit cancellation removes only this session's provisional message. */
	async cancel() {
		if (this.phase === "results" && !this.busy) {
			return this.dispose(false);
		}
		if (this.commitStarted || this.finished) {
			return;
		}
		await this.dispose(true);
		if (this.message) {
			await deletePreview(this.message);
		}
	}

	/** Remove every local listener/graphic and optionally restore prior targets. */
	async dispose(restore) {
		if (!this.finished && this.attackMessages.length) {
			attackResults.complete(this.id);
		}
		this.finished = true;
		sharedAreaPreview.clear();
		CoverPreview.setContext(null);
		window.clearTimeout(this.movementTimer);
		this.listeners.abort();
		this.graphics?.destroy({ children: true });
		this.rangeMask?.destroy();
		if (session === this) {
			session = null;
		}
		await this.dialog?.close();
		if (restore && canvas.ready) {
			this.syncTargets(this.previousTargets);
		}
		await this.panel?.close();
	}
}

/** Small independent ApplicationV2; presentation does not belong to the Actor HUD. */
class TargetingPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: ["power-targeting"], position: { width: 340, height: "auto" },
		window: { title: "Select Targets", resizable: true },
		actions: {
			undoWall() { this.session.editWall(); },
			clearWall() { this.session.editWall(true); },
			reposition() {
				if (!this.session.busy) {
					this.session.placementLocked = this.session.range.shape === "closeBurst";
					this.session.selectAreaTargets();
					this.session.refresh();
				}
			},
			selectArea() {
				if (!this.session.busy) {
					this.session.selectAreaTargets();
					this.session.refresh();
				}
			},
			async toggleDetails() {
				this.showDetails = !this.showDetails;
				await this.render({ force: true });
				this.setPosition({ height: "auto" });
			},
			attack() { return this.session.attack(); },
			rollDamage(event) { return this.session.rollDamage(event); },
			complete() {
				if (this.session.canComplete()) {
					return this.session.dispose(false);
				}
			},
			cancel() { return this.session.cancel(); },
			removeTarget(event, target) {
				if (!this.session.busy) {
					this.session.excludeAreaTarget(this.session.targets.find(token => token.id === target.dataset.tokenId));
					this.session.targets = this.session.targets.filter(token => token.id !== target.dataset.tokenId);
					this.session.syncTargets();
					this.session.refresh();
				}
			},
		},
	};
	static PARTS = { body: { template: `modules/${MODULE_ID}/scripts/power-activation/panel.hbs` } };

	constructor(activation) {
		const sidebarWidth = ui.sidebar?.element?.getBoundingClientRect?.().width ?? 320;
		// Start beside the sidebar, above canvas center; subsequent renders preserve dragging.
		super({ position: {
			left: Math.max(16, (window.innerWidth ?? 1280) - sidebarWidth - 340 - 32),
			top: Math.max(50, Math.round((window.innerHeight ?? 900) * .12)),
		} });
		this.session = activation;
	}

	/** Prepare only current-session display data. */
	async _prepareContext() {
		const activation = this.session;
		this.beforeAttackRules ??= preAttackRules(activation.card);
		if (activation.phase === "results") {
			this.resolutionRules ??= postAttackRules(activation.card);
			return {
				resolved: true, powerName: activation.item.name, card: activation.card,
				resolutionRules: this.resolutionRules,
				beforeAttackRules: this.beforeAttackRules,
				hasDamageTotal: Number.isFinite(activation.damageTotal), damageTotal: activation.damageTotal,
				showDetails: Boolean(this.showDetails), busy: activation.busy,
				needsDamage: activation.item.hasDamage && !activation.damageRolled,
				canComplete: activation.canComplete(),
				status: activation.busy ? "Rolling damage…" : activation.damageRolled ? "Damage rolled" : "Attack resolved",
				results: activation.attackMessages.flatMap(message => messageAttackResults(message, canvas.scene?.id)
					.map(result => ({ ...result, name: canvas.tokens.get(result.tokenId)?.visible
						? canvas.tokens.get(result.tokenId).name : "Unavailable target" }))),
			};
		}
		const problems = activation.problems();
		// Placement problems belong above the roster, not on every creature.
		const placementProblems = activation.range.shape ? activation.areaProblems([], false) : [];
		const targets = activation.targets.map(token => {
			const warnings = [...activation.filterProblems([token]), ...(activation.range.shape ? activation.areaProblems([token], false)
				: selectionProblems(activation.source, [token], activation.range, 1, canvas.grid.size))]
				.filter(problem => !placementProblems.includes(problem));
			return {
				id: token.id, name: token.visible ? token.name : "Unavailable target",
				img: token.visible ? token.document.texture?.src : null,
				invalid: warnings.length > 0, warnings,
			};
		});
		const targetWarnings = new Set(targets.flatMap(target => target.warnings));
		return {
			hasAttack: Boolean(activation.item.hasAttack),
			beforeAttackRules: activation.item.hasAttack ? this.beforeAttackRules : "",
			originChoices: activation.originChoices().map(token => ({ id: token.id, name: token.name, selected: token === activation.source })),
			summon: activation.range.shape === "summon",
			wall: activation.range.shape === "wall", wallCount: activation.wallCells.length, wallHint: activation.wallHint,
			area: Boolean(activation.range.shape), movableArea: activation.range.shape && activation.range.shape !== "closeBurst" && activation.range.shape !== "wall",
			areaLabel: { closeBurst: "Close burst", closeBlast: "Close blast", rangeBurst: "Area burst", rangeBlast: "Area blast", wall: "Area wall", summon: "Summon square" }[activation.range.shape],
			areaOriginHint: activation.range.shape === "rangeBlast" ? "The pointer places the blast's top-left corner. The white square marks its nearest origin square to the caster."
				: activation.range.shape === "rangeBurst" ? "The pointer chooses the burst's center square. Range is measured to that square." : "",
			placementLocked: activation.placementLocked, areaSize: activation.range.area,
			countModeLabel: automationConfig(activation.item).targetCountMode === "upTo" ? "up to" : "exactly",
			countedTargets: activation.range.shape !== "summon" && (!activation.range.shape || automationConfig(activation.item).targetMode === "exact"),
			powerName: activation.item.name, showDetails: Boolean(this.showDetails),
			card: activation.card, range: activation.range.maximum, normalRange: activation.range.normal,
			longRange: activation.range.maximum > activation.range.normal, required: activation.count,
			selected: activation.targets.length, busy: activation.busy, cancellable: !activation.commitStarted,
			ready: !problems.length && !activation.busy,
			status: activation.waitingForDice ? "Rolling attack dice…" : activation.busy ? (activation.item.hasAttack ? "Attack dialog open" : "Using ability") : (problems.length ? "Review targets" : "Ready"),
			problems: [...new Set(problems)].filter(problem => !targetWarnings.has(problem)), targets,
		};
	}

	/** Rebind origin selection after each panel render. */
	_onRender() {
		this.element.querySelector("[data-origin-selector]")?.addEventListener("change", event => this.session.changeOrigin(event.target.value));
	}

	/** Close resolved attacks without undoing their use; don't interrupt a committing roll. */
	async close(options) {
		if (!this.session.finished) {
			if (this.session.phase === "results" && !this.session.busy) {
				return this.session.dispose(false);
			}
			if (this.session.commitStarted) {
				return;
			}
			return this.session.cancel();
		}
		return super.close(options);
	}
}
