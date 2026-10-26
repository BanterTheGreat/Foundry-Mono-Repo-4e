import { MODULE_ID } from "./rules.js";

const LABELS = { hit: "HIT", miss: "MISS", critical: "CRIT", fumble: "CRIT FAIL", immune: "IMMUNE" };
const DURATION = 4400;

/**
 * Read only newly created, visible attack messages from a confirmed automation session.
 * DnD4e 0.9.3 copies roll options.flags to the message and stores each target's
 * verdict in roll.options.multirollData. Never infer targets from current selection.
 * The persisted attackResults flag is {sessionId, sceneId, targetIds: string[]}.
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
	}

	/** Receive the same chat document on each client; Foundry controls its visibility. */
	register() {
		Hooks.on("createChatMessage", message => this.showAfterAnimation(message));
		Hooks.on("canvasTearDown", () => this.clear());
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
		for (const result of messageAttackResults(message, canvas.scene.id)) {
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
			this.entries.set(result.tokenId, { element, message, expires: Date.now() + DURATION });
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
