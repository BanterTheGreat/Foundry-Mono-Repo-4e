import { MODULE_ID, SETTING } from "./rules.js";
import { damageApplicationTargets, prepareDamageTarget, applyTargetDamage } from "./damage-application-data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const panels = new Map();
const seen = new Set();

/** Open one review per confirmed attack on the elected logged-in GM. */
export function openDamageApplication(message) {
	if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || !game.settings.get(MODULE_ID, SETTING)
		|| !damageApplicationTargets(message).length) {
		return;
	}
	let panel = panels.get(message.id);
	if (!panel) {
		panel = new DamageApplicationPanel(message);
		panels.set(message.id, panel);
	}
	seen.add(message.id);
	void panel.render({ force: true });
}

/** Listen to persisted chat confirmation rather than accepting player-supplied socket damage. */
export function registerDamageApplication() {
	const receive = message => {
		if (!seen.has(message.id) && message.flags?.[MODULE_ID]?.damageApplication) {
			openDamageApplication(message);
		}
	};
	Hooks.on("createChatMessage", receive);
	Hooks.on("updateChatMessage", message => {
		receive(message);
		panels.get(message.id)?.render({ force: true });
	});
	Hooks.on("deleteChatMessage", message => panels.get(message.id)?.close());
	for (const hook of ["updateActor", "updateToken", "deleteToken"]) {
		Hooks.on(hook, () => {
			for (const panel of panels.values()) {
				void panel.render({ force: true });
			}
		});
	}
	Hooks.on("refreshToken", token => {
		for (const panel of panels.values()) {
			if (panel.highlightedId === token.id) {
				panel.highlightToken(token.id);
			}
		}
	});
	Hooks.on("canvasTearDown", () => {
		for (const panel of panels.values()) {
			panel.clearHighlight();
		}
	});
	// A closed popup can be reopened without confirming or rolling damage again.
	Hooks.on("renderChatMessageHTML", (message, element) => {
		if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || !damageApplicationTargets(message).length) {
			return;
		}
		element.querySelector(".power-damage-reopen")?.remove();
		const button = document.createElement("button");
		button.type = "button";
		button.className = "power-damage-reopen";
		button.textContent = "Review / Apply Damage";
		button.addEventListener("click", () => openDamageApplication(message));
		element.querySelector(".message-content")?.append(button);
	});
	// Recover outstanding reviews after a GM reload; completed history stays closed.
	for (const message of game.messages.contents) {
		const targets = damageApplicationTargets(message);
		if (targets.some(target => message.flags[MODULE_ID].damageApplications?.[target.tokenId]?.state !== "applied")) {
			receive(message);
		}
	}
}

/** Compact GM-only ledger; each row remains independently applicable. */
export class DamageApplicationPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: ["power-damage-application"],
		position: { width: 576, height: "auto" },
		window: { title: "Apply Damage", resizable: false },
		actions: {
			applyTarget(event, target) { return this.applyDamage([target.dataset.tokenId]); },
			applyAll() { return this.applyDamage(); },
			closeReview() { return this.close(); },
		},
	};
	static PARTS = {
		body: { template: `modules/${MODULE_ID}/scripts/power-activation/damage-application.hbs` },
	};

	constructor(message) {
		super({ id: `power-damage-application-${message.id}` });
		this.message = message;
		this.applying = false;
		this.highlight = null;
		this.highlightedId = null;
	}

	/** Recalculate from current actor HP and resistances whenever the view renders. */
	async _prepareContext() {
		const request = this.message.flags[MODULE_ID].damageApplication;
		const targets = await Promise.all(damageApplicationTargets(this.message).map(async target => {
			try {
				return await prepareDamageTarget(this.message, target);
			} catch (error) {
				return { ...target, name: game.scenes.get(request.sceneId)?.tokens.get(target.tokenId)?.name ?? "Unavailable target",
					unavailable: true, status: error.message, disabled: true };
			}
		}));
		const remaining = targets.filter(target => !target.disabled);
		const reviewCount = targets.filter(target => target.uncertain || target.unavailable).length;
		return { name: request.name, actorName: request.actorName, userName: this.message.author?.name,
			targets: targets.map(target => ({ ...target, disabled: target.disabled || this.applying || game.users.activeGM?.id !== game.user.id })),
			count: targets.length, applied: targets.filter(target => target.applied).length,
			remaining: remaining.length, reviewCount, damageRemaining: remaining.reduce((sum, target) => sum + target.amount, 0),
			canApply: !this.applying && remaining.length > 0 && game.users.activeGM?.id === game.user.id,
			applying: this.applying, sceneName: game.scenes.get(request.sceneId)?.name };
	}

	/** Lock the footer and all rows while writes are in flight; retain successful rows after failures. */
	async applyDamage(tokenIds) {
		if (this.applying) {
			return;
		}
		this.applying = true;
		this.clearHighlight();
		void this.render({ force: true });
		try {
			const targets = damageApplicationTargets(this.message).filter(target =>
				(!tokenIds || tokenIds.includes(target.tokenId)) && !this.message.flags[MODULE_ID].damageApplications?.[target.tokenId]);
			for (const target of targets) {
				try {
					await applyTargetDamage(this.message, target.tokenId);
				} catch (error) {
					console.error(`${MODULE_ID} | Apply damage`, error);
					ui.notifications.error(error.message);
				}
			}
		} finally {
			this.applying = false;
			await this.render({ force: true });
		}
	}

	/** Hover/focus includes the row's Apply button without changing selection or targets. */
	_onRender(context, options) {
		super._onRender(context, options);
		this.clearHighlight();
		for (const row of this.element.querySelectorAll("[data-damage-token]")) {
			const enter = () => this.highlightToken(row.dataset.damageToken);
			const leave = () => this.clearHighlight();
			row.addEventListener("pointerenter", enter);
			row.addEventListener("pointerleave", leave);
			row.addEventListener("focusin", enter);
			row.addEventListener("focusout", event => {
				if (!row.contains(event.relatedTarget)) {
					leave();
				}
			});
		}
		this.setPosition({ height: "auto" });
	}

	/** Draw a local gold outline; no private Token hover APIs or token mutations. */
	highlightToken(tokenId) {
		this.clearHighlight();
		const request = this.message.flags[MODULE_ID].damageApplication;
		const token = canvas.scene?.id === request.sceneId ? canvas.tokens?.get(tokenId) : null;
		if (!token || token.destroyed) {
			return;
		}
		this.highlightedId = tokenId;
		this.highlight = new PIXI.Graphics();
		this.highlight.eventMode = "none";
		this.highlight.lineStyle(3, 0xf0d38f, 1).drawRoundedRect(token.x - 3, token.y - 3, token.w + 6, token.h + 6, 6);
		canvas.tokens.addChild(this.highlight);
	}

	/** Remove this popup's highlight on leave, rerender, canvas teardown or close. */
	clearHighlight() {
		this.highlight?.destroy();
		this.highlight = null;
		this.highlightedId = null;
	}

	/** Closing leaves receipts intact so reopening cannot apply the same damage twice. */
	async close(options) {
		this.clearHighlight();
		panels.delete(this.message.id);
		return super.close(options);
	}
}
