import { CoverPreview } from "./cover-preview.js";
import { MODULE_ID, SETTING, automationConfig, selectionProblems } from "./rules.js";
import { renderPowerCard, createPowerMessage } from "./cards.js";
import { loadSystem, resolveRange, registerAutomationTab, commitCardCosts, commitPowerUse } from "./system-adapter.js";

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
	Hooks.on("updateToken", () => session?.refresh());
	Hooks.on("refreshToken", token => session?.refreshMovingToken(token));
	Hooks.on("canvasPan", () => session?.drawRange());
	Hooks.on("sightRefresh", () => session?.drawRange());
	Hooks.on("lightingRefresh", () => session?.drawRange());
	Hooks.on("deleteToken", document => {
		if (session?.source.id === document.id) {
			void session.cancel();
		} else {
			session?.refresh();
		}
	});
	Hooks.on("deleteItem", item => {
		if (session?.item.uuid === item.uuid) {
			void session.cancel();
		}
	});
	Hooks.on("updateActor", () => void session?.refreshRange());
	Hooks.on("updateItem", () => void session?.refreshRange());
	Hooks.on("canvasTearDown", () => void session?.cancel());
	Hooks.on("renderApplicationV2", app => session?.bindAttackDialog(app));
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
		if (!item.hasAttack || !["weapon", "melee", "range"].includes(item.system.rangeType) || !canvas.grid.isSquare) {
			throw new Error("Target automation currently supports Weapon, Melee X and Ranged X attacks on square grids.");
		}
		const count = automationConfig(item).targetCount;
		if (!Number.isInteger(count) || count < 1) {
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
		this.id = foundry.utils.randomID();
		this.previousTargets = [...game.user.targets];
		this.targets = [];
		this.busy = false;
		this.finished = false;
		this.committed = false;
		this.syncing = false;
		this.listeners = new AbortController();
	}

	/** Start fresh targets and install the session cancellation shortcut. */
	async start() {
		this.message = await createPowerMessage(this.item, this.card, this.id);
		if (!this.message) {
			throw new Error("Could not create the temporary ability card.");
		}
		if (this.finished) {
			await deletePreview(this.message);
			return;
		}
		this.syncTargets();
		this.panel = new TargetingPanel(this);
		const options = { capture: true, signal: this.listeners.signal };
		window.addEventListener("keydown", event => {
			if (event.key === "Escape" && !this.busy) {
				event.stopImmediatePropagation();
				void this.cancel();
			}
		}, options);
		this.refresh();
	}

	/** Follow Foundry's standard targeting controls. */
	targetChanged(token, targeted) {
		if (this.syncing || this.finished) {
			return;
		}
		if (this.busy) {
			this.syncTargets();
			return;
		}
		this.targets = [...game.user.targets];
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

	/** Build advisory errors; unavailable targets remain in the panel until removed. */
	problems() {
		return selectionProblems(this.source, this.targets, this.range, this.count, canvas.grid.size);
	}

	/** Re-evaluate formulas and weapon defaults when actor/item data changes. */
	async refreshRange() {
		if (this.finished || this.busy) {
			return;
		}
		try {
			this.range = await resolveRange(this.item);
			this.count = automationConfig(this.item).targetCount;
			if (!Number.isInteger(this.count) || this.count < 1 || !automationConfig(this.item).enabled) {
				throw new Error("The power's automation configuration changed. Start Use Ability again after configuring it.");
			}
			this.refresh();
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
		if (!this.item.isOwner || !this.item.actor?.isOwner) {
			void this.cancel();
			return;
		}
		// Cover shares the targeting lifecycle and resolved attack mode.
		CoverPreview.setContext(this.busy ? null : {
			source: this.source, targets: [...this.targets], mode: this.range.mode,
		});
		this.drawRange();
		this.panel?.render({ force: true });
	}

	/** Follow rendered token positions throughout movement without rebuilding the panel each frame. */
	refreshMovingToken(token) {
		if (this.finished || (token !== this.source && !this.targets.includes(token))) {
			return;
		}
		if (token === this.source) {
			this.drawRange();
		}
		window.clearTimeout(this.movementTimer);
		this.movementTimer = window.setTimeout(() => this.refresh(), 100);
	}

	/** Draw around the source's current canvas position, including interpolated movement. */
	drawRange() {
		if (this.finished) {
			return;
		}
		this.graphics ??= canvas.interface.addChild(new PIXI.Graphics());
		this.graphics.eventMode = "none";
		this.graphics.clear();
		this.refreshRangeMask();
		if (!this.busy) {
			this.drawRangeFill();
			if (this.range.maximum > this.range.normal) {
				this.drawRangeBoundary(this.range.maximum, 0x9fc5e4, true);
			}
			this.drawRangeBoundary(this.range.normal, 0xf5d787, false);
		}
	}

	/**
	 * Clip the entire overlay, including borders, to the unpadded map
	 * and this attacker's sight. Lit areas also require the attacker's light-perception LOS.
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
		const vision = this.source.vision;
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
		return JSON.stringify([this.item.toObject(), this.item.actor.toObject(), this.source.document.toObject(), this.targets.map(token => [token.id, token.document.toObject(), token.actor?.toObject()])]);
	}

	/** Open the existing attack dialog after confirmation; no use is spent on dialog cancellation. */
	async attack() {
		if (this.busy || this.finished) {
			return;
		}
		this.busy = true;
		this.refresh();
		try {
			if (this.targets.some(token => !token.visible || !token.actor || canvas.tokens.get(token.id) !== token)) {
				throw new Error("Remove unavailable targets before attacking.");
			}
			const utils = await loadSystem();
			if (utils.tokenForActor(this.item.actor)?.id !== this.source.id) {
				throw new Error("The system's source token changed. Select the original attacker before attacking.");
			}
			this.range = await resolveRange(this.item);
			if (this.finished) {
				return;
			}
			if (!await this.confirmProblems() || this.finished) {
				return;
			}
			this.syncTargets();
			this.confirmedKey = this.contextKey();
			// 0.9.3 inverts modifier behavior when fast-forward is the user's default.
			const shiftKey = Boolean(game.settings.get("dnd4e", "fastFowardSettings"));
			await this.item.rollAttack({ event: { shiftKey, clientY: 160 }, powerActivationSession: this.id });
			if (this.committed) {
				await this.complete();
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
			if (system.tokenForActor(this.item.actor)?.id !== this.source.id || canvas.tokens.get(this.source.id) !== this.source) {
				ui.notifications.warn("The source token changed. Review targets and reopen the attack dialog.");
				return false;
			}
			if (this.contextKey() !== this.confirmedKey) {
				ui.notifications.warn("The ability or battlefield changed. Review targets and open the attack dialog again.");
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
				this.committed = true;
				await commitPowerUse(this.item);
				if (game.settings.get("dnd4e", "autoApplyEffects")) {
					const utils = await loadSystem();
					await utils.applyEffectsToTokens(this.item.effects, [this.source], "self", this.item.actor);
					await utils.applyAllXEffectsToTokens(this.item.effects, this.item.actor, new Set(this.targets));
				}
				Hooks.callAll("dnd4e.usePower", this.item, ChatMessage.getSpeaker({ actor: this.item.actor }));
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

	/** Preserve the played card and clear local selection UI after a committed roll. */
	async complete() {
		try {
			if (this.message && game.messages.has(this.message.id)) {
				const content = await renderPowerCard(this.item, await loadSystem(), { showActions: true });
				await this.message.update({ content, [`flags.${MODULE_ID}.powerActivation.provisional`]: false });
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Could not finalize played power card`, error);
			ui.notifications.warn("The attack finished, but its power card could not be finalized. Check chat before reloading.");
		} finally {
			await this.dispose(false);
		}
	}

	/** Explicit cancellation removes only this session's provisional message. */
	async cancel() {
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
		this.finished = true;
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
			async toggleDetails() {
				this.showDetails = !this.showDetails;
				await this.render({ force: true });
				this.setPosition({ height: "auto" });
			},
			attack() { return this.session.attack(); },
			cancel() { return this.session.cancel(); },
			removeTarget(event, target) {
				if (!this.session.busy) {
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
		const problems = activation.problems();
		return {
			powerName: activation.item.name, showDetails: Boolean(this.showDetails),
			card: activation.card, range: activation.range.maximum, normalRange: activation.range.normal,
			longRange: activation.range.maximum > activation.range.normal, required: activation.count,
			selected: activation.targets.length, busy: activation.busy, cancellable: !activation.commitStarted,
			ready: !problems.length && !activation.busy,
			status: activation.busy ? "Attack dialog open" : (problems.length ? "Review targets" : "Ready"),
			problems, targets: activation.targets.map(token => ({
				id: token.id, name: token.visible ? token.name : "Unavailable target",
				img: token.visible ? token.document.texture?.src : null,
				invalid: selectionProblems(activation.source, [token], activation.range, 1, canvas.grid.size).length > 0,
			})),
		};
	}

	/** Closing the panel is the same as Cancel; don't interrupt a committing roll. */
	async close(options) {
		if (!this.session.finished) {
			if (this.session.commitStarted) {
				return;
			}
			return this.session.cancel();
		}
		return super.close(options);
	}
}
