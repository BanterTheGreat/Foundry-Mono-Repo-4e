import { MODULE_ID } from "./rules.js";

const LABELS = { hit: "HIT", miss: "MISS", critical: "CRIT", fumble: "CRIT FAIL", immune: "IMMUNE" };
const DURATION = 3000;
const CHANNEL = `module.${MODULE_ID}`;

/**
 * Read only newly created, visible attack messages from a confirmed automation session.
 * DnD4e 0.9.3 copies roll options.flags to the message and stores each target's
 * verdict in roll.options.multirollData. Never infer targets from current selection.
 * The persisted attackResults flag includes {sessionId, sceneId, targetIds: string[], pending,
 * itemUuid, casterId, effectsManaged}; effect reconciliation reads only this session’s messages.
 */
export function messageAttackResults(message, sceneId) {
	const context = message.flags?.[MODULE_ID]?.attackResults;
	if (!message.visible || !message.isContentVisible || !context?.sessionId
		|| context.sceneId !== sceneId || !Array.isArray(context.targetIds)) {
		return [];
	}
	return (message.rolls ?? []).flatMap(roll => {
		const attack = roll.options?.multirollData;
		if (!attack?.targetID || !context.targetIds.includes(attack.targetID) || !Number.isFinite(roll.total)) {
			return [];
		}
		const outcome = LABELS[attack.critstate] ? attack.critstate : LABELS[attack.hitstate] ? attack.hitstate : "attack";
		return [{ tokenId: attack.targetID, total: roll.total, outcome, label: LABELS[outcome] ?? "ATTACK" }];
	});
}

/** Place above a token, shifting sideways to avoid nearby tokens and earlier badges. */
export function placeAttackBadge(anchor, width, height, obstacles, viewport) {
	const gap = 6;
	const top = Math.max(gap, anchor.y - height - 12);
	const ideal = anchor.x - width / 2;
	const candidates = [ideal, ...obstacles.flatMap(rect => [rect.left - width - gap, rect.right + gap])]
		.map(left => Math.max(gap, Math.min(viewport.width - width - gap, left)))
		.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
	const left = candidates.find(x => !obstacles.some(rect => x < rect.right + gap && x + width > rect.left - gap
		&& top < rect.bottom + gap && top + height > rect.top - gap)) ?? candidates[0];
	return { left, top, right: left + width, bottom: top + height,
		pointer: Math.max(8, Math.min(width - 8, anchor.x - left)) };
}

/** Ephemeral DOM badges follow canvas coordinates, while chat remains the result record. */
export class AttackResults {
	constructor() {
		this.entries = new Map();
		this.frame = null;
		this.generation = 0;
		this.completed = new Map();
	}

	/** Receive the same chat document on each client; Foundry controls its visibility. */
	register() {
		game.socket.on(CHANNEL, message => {
			if (message?.type === "attackResultsComplete" && message.sceneId === canvas.scene?.id
				&& typeof message.sessionId === "string") {
				this.finish(message.sessionId);
			}
		});
		Hooks.on("createChatMessage", message => this.showAfterAnimation(message));
		Hooks.on("updateChatMessage", message => this.show(message));
		Hooks.on("canvasTearDown", () => this.clear());
	}

	/** Start the grace period on every client when the activation panel closes. */
	complete(sessionId) {
		this.finish(sessionId);
		game.socket.emit(CHANNEL, { type: "attackResultsComplete", sceneId: canvas.scene?.id, sessionId });
	}

	/** Retain the deadline for dice animations that finish after Complete was pressed. */
	finish(sessionId) {
		if (this.completed.has(sessionId)) {
			return;
		}
		const expires = Date.now() + DURATION;
		this.completed.set(sessionId, expires);
		for (const entry of this.entries.values()) {
			if (entry.message.flags[MODULE_ID].attackResults.sessionId === sessionId) {
				entry.expires = expires;
			}
		}
	}

	/** Wait for this client's message animation, including skipped or disabled dice. */
	async showAfterAnimation(message) {
		if (!canvas.ready || !messageAttackResults(message, canvas.scene.id).length) {
			return;
		}
		const generation = this.generation;
		const dice3d = globalThis.game?.dice3d;
		if (typeof dice3d?.waitFor3DAnimationByMessageID === "function") {
			try {
				await dice3d.waitFor3DAnimationByMessageID(message.id);
			} catch (error) {
				console.warn(`${MODULE_ID} | Could not wait for Dice So Nice; showing attack results`, error);
			}
		}
		// A scene change invalidates pending results even when returning to the same scene.
		if (generation === this.generation) {
			this.show(message);
		}
	}

	/** Build badges using text nodes; replace a token's earlier result on a new attack. */
	show(message) {
		if (!canvas.ready) {
			return;
		}
		const results = messageAttackResults(message, canvas.scene.id);
		for (const [tokenId, entry] of this.entries) {
			if (entry.message.id === message.id && !results.some(result => result.tokenId === tokenId)) {
				this.remove(tokenId);
			}
		}
		for (const result of results) {
			const token = canvas.tokens.get(result.tokenId);
			if (!token?.isVisible) {
				continue;
			}
			this.remove(result.tokenId);
			const element = document.createElement("div");
			element.className = `power-attack-result power-attack-result--${result.outcome}`;
			element.setAttribute("aria-label", `${token.name}: ${result.total}, ${result.label}`);
			for (const [name, value] of [["total", result.total], ["outcome", result.label]]) {
				const span = document.createElement("span");
				span.className = `power-attack-result__${name}`;
				span.textContent = String(value);
				element.append(span);
			}
			element.hidden = true;
			document.body.append(element);
			const sessionId = message.flags[MODULE_ID].attackResults.sessionId;
			this.entries.set(result.tokenId, { element, message, expires: this.completed.get(sessionId) ?? Infinity });
		}
		if (this.entries.size && this.frame === null) {
			this.update();
		}
	}

	/** Track pan, zoom, token movement and visibility only while a result is on screen. */
	update() {
		this.frame = null;
		if (!canvas.ready) {
			this.clear();
			return;
		}
		const view = canvas.app.view.getBoundingClientRect();
		const screen = canvas.app.renderer.screen;
		const toScreen = (token, x, y) => {
			const point = token.toGlobal(new PIXI.Point(x, y));
			return { x: view.left + point.x * view.width / screen.width,
				y: view.top + point.y * view.height / screen.height };
		};
		const obstacles = canvas.tokens.placeables.filter(token => token.isVisible).map(token => {
			const start = toScreen(token, 0, 0);
			const end = toScreen(token, token.w, token.h);
			return { left: start.x, top: start.y, right: end.x, bottom: end.y };
		});
		for (const [tokenId, entry] of this.entries) {
			const token = canvas.tokens.get(tokenId);
			if (!token?.isVisible || Date.now() >= entry.expires || !entry.message.visible || !entry.message.isContentVisible) {
				this.remove(tokenId);
				continue;
			}
			const anchor = toScreen(token, token.w / 2, 0);
			const element = entry.element;
			element.hidden = anchor.x < view.left || anchor.x > view.right || anchor.y < view.top || anchor.y > view.bottom;
			if (element.hidden) {
				continue;
			}
			const position = placeAttackBadge(anchor, element.offsetWidth, element.offsetHeight, obstacles, { width: window.innerWidth });
			element.style.left = `${position.left}px`;
			element.style.top = `${position.top}px`;
			element.style.setProperty("--pointer-x", `${position.pointer}px`);
			obstacles.push(position);
		}
		if (this.entries.size) {
			this.frame = requestAnimationFrame(() => this.update());
		}
	}

	/** Remove one token's badge without affecting any other target. */
	remove(tokenId) {
		this.entries.get(tokenId)?.element.remove();
		this.entries.delete(tokenId);
	}

	/** Cancel animation and remove every badge when the scene is torn down. */
	clear() {
		this.generation++;
		this.completed.clear();
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		for (const tokenId of this.entries.keys()) {
			this.remove(tokenId);
		}
	}
}

export const attackResults = new AttackResults();

/** Preserve the exact native defence, including conditional bonuses, for later review. */
export async function registerAttackReview() {
	const { default: MultiAttackRoll } = await import("../../../../systems/dnd4e/module/rolls/multi-attack-roll.mjs");
	const populate = MultiAttackRoll.prototype.populateMultirollData;
	MultiAttackRoll.prototype.populateMultirollData = function (targets, criticals) {
		const result = populate.call(this, targets, criticals);
		this.multirollData.forEach((attack, index) => {
			attack.reviewDefence = targets.targDefValArray[index];
		});
		return result;
	};
}

/** Add a flat post-roll adjustment without rolling the original dice again. */
export async function adjustAttackMessage(message, index, modifier) {
	if (!message.isOwner || !Number.isFinite(modifier)) {
		throw new Error("Enter a numeric modifier for an attack message you own.");
	}
	const rolls = message.rolls.map(roll => roll.constructor.fromJSON(JSON.stringify(roll)));
	const original = message.rolls[index];
	const attack = rolls[index]?.options?.multirollData;
	if (!attack || !Number.isFinite(attack.reviewDefence)) {
		throw new Error("This roll has no saved defence. Roll a new attack after reloading the module.");
	}
	const previous = original.options.postAttackModifier ?? 0;
	const delta = modifier - previous;
	const roll = rolls[index];
	// Evaluated numeric terms keep the original die results and expose the adjustment in chat.
	if (delta) {
		roll.terms.push(new foundry.dice.terms.OperatorTerm({ operator: delta < 0 ? "-" : "+" }),
			new foundry.dice.terms.NumericTerm({ number: Math.abs(delta), options: { flavor: "Post-roll modifier" } }));
		roll._formula = roll.constructor.getFormula(roll.terms);
		roll._total = original.total + delta;
	}
	roll.options.postAttackModifier = modifier;
	attack.total = roll.total;
	if (!["critical", "fumble", "immune"].includes(attack.critstate) && ["hit", "miss"].includes(attack.hitstate)) {
		attack.hitstate = roll.total >= attack.reviewDefence ? "hit" : "miss";
		attack.hittext = game.i18n.localize(attack.hitstate === "hit" ? "DND4E.AttackRollHit" : "DND4E.AttackRollMiss");
	}
	// Keep an explicit audit label even if the modifier is later returned to zero.
	const editLabel = `Manually edited (${modifier >= 0 ? "+" : ""}${modifier})`;
	attack.hittext = `${(attack.hittext ?? "").replace(/ · Manually edited \(.*\)$/, "")} · ${editLabel}`;
	await message.update({ rolls, content: String(rolls.reduce((total, entry) => total + entry.total, 0)),
		"flags.dnd4e.-=multi-attack-roll": null });
}

/** Persist target removal in the existing chat document and invalidate native cached multiroll HTML. */
export async function removeAttackTarget(message, tokenId) {
	const context = message.flags?.[MODULE_ID]?.attackResults;
	if (!context?.targetIds?.includes(tokenId)) {
		return;
	}
	if (!message.isOwner) {
		throw new Error("You no longer own this attack message.");
	}
	const rolls = message.rolls.filter(roll => roll.options?.multirollData?.targetID !== tokenId);
	await message.update({ rolls, content: rolls.length ? String(rolls.reduce((total, roll) => total + roll.total, 0))
		: "<p>All targets removed from this attack.</p>",
		[`flags.${MODULE_ID}.attackResults.targetIds`]: context.targetIds.filter(id => id !== tokenId),
		"flags.dnd4e.-=multi-attack-roll": null });
}
