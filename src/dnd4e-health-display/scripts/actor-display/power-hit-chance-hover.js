import { formatPowerHitChances } from "./npc-power-hints.js";

/** Client-only hit chance labels in the same above-token interface layer as cover labels. */
export class PowerHitChanceHover {
	constructor() {
		this.revision = 0;
		this.hooks = [];
	}

	/** Remove labels, listeners and pending asynchronous results. */
	clear() {
		this.revision++;
		for (const [name, id] of this.hooks) {
			Hooks.off(name, id);
		}
		this.hooks = [];
		this.overlay?.destroy({ children: true });
		this.overlay = null;
	}

	/** Resolve the native base attack bonus once per hover, never rolling or targeting anything. */
	async show(item, source, blocked = () => false) {
		this.clear();
		const revision = this.revision;
		const defense = item?.system?.attack?.def;
		const valid = () => canvas.ready && !blocked() && item?.type === "power"
			&& (item.hasAttack ?? item.system?.attack?.isAttack) && item.isOwner
			&& ["ac", "fort", "ref", "wil"].includes(defense)
			&& source?.actor === item.actor && canvas.tokens.get(source.id) === source;
		if (!valid()) {
			return;
		}
		for (const name of ["canvasTearDown", "deleteToken", "deleteItem"]) {
			this.hooks.push([name, Hooks.on(name, () => this.clear())]);
		}
		try {
			const bonus = await item.getAttackBonus();
			if (revision !== this.revision) {
				return;
			}
			if (!valid() || typeof bonus !== "number" || !Number.isFinite(bonus)) {
				this.clear();
				return;
			}
			const draw = () => {
				if (!valid()) {
					this.clear();
					return;
				}
				this.draw(defense, bonus);
			};
			for (const name of ["targetToken", "controlToken", "hoverToken", "refreshToken", "updateToken", "canvasPan", "sightRefresh"]) {
				this.hooks.push([name, Hooks.on(name, draw)]);
			}
			for (const name of ["updateActor", "updateItem"]) {
				this.hooks.push([name, Hooks.on(name, () => void this.show(item, source, blocked))]);
			}
			draw();
		} catch {
			if (revision === this.revision) {
				this.clear();
			}
		}
	}

	/** Follow visible scene PCs and camera zoom; interface labels render above all token art. */
	draw(defense, bonus) {
		this.overlay?.destroy({ children: true });
		this.overlay = null;
		const candidates = new Set([...game.user.targets, ...canvas.tokens.controlled,
			...canvas.tokens.placeables.filter(token => token.hover)]);
		const scale = 1 / canvas.stage.scale.x;
		for (const token of candidates) {
			const value = token.actor?.system?.defences?.[defense]?.value;
			if (token.actor?.type !== "Player Character" || !token.visible || canvas.tokens.get(token.id) !== token
				|| value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
				continue;
			}
			this.overlay ??= canvas.interface.addChild(new PIXI.Container());
			this.overlay.eventMode = "none";
			// Token void meshes erase earlier interface content inside their footprint.
			// Sort after the token layer so the label survives when placed over the art.
			this.overlay.zIndex = (canvas.tokens.zIndex ?? 0) + 1;
			const text = formatPowerHitChances([{ name: "", value: Number(value) }], bonus).trim().replace(/[()]/g, "");
			const label = new foundry.canvas.containers.PreciseText(`${text} to hit`, {
				fontFamily: "sans-serif", fontSize: 16, fill: 0xdfcd94,
				align: "center", stroke: 0x15191f, strokeThickness: 3,
			});
			label.scale.set(scale);
			label.anchor.set(0.5, 0);
			label.position.set(token.x + token.w / 2, token.y + token.h - label.height - 5 * scale);
			const background = new PIXI.Graphics();
			background.beginFill(0x15191f, 0.9);
			background.drawRoundedRect(label.x - label.width / 2 - 5 * scale, label.y - 3 * scale,
				label.width + 10 * scale, label.height + 6 * scale, 4 * scale);
			background.endFill();
			this.overlay.addChild(background, label);
		}
	}
}

const preview = new PowerHitChanceHover();

/** Bind whole power rows and dispose labels on leaving, rerendering, closing or activation. */
export function bindPowerHitChanceHover(root, actor, token, blocked) {
	const listeners = [];
	for (const row of root.querySelectorAll(".dnd4e-experimental-actor-display__power[data-item-id]")) {
		const show = () => void preview.show(actor.items.get(row.dataset.itemId), token, blocked);
		const hide = event => {
			if (!row.contains(event.relatedTarget)) {
				preview.clear();
			}
		};
		for (const [name, callback] of [["mouseenter", show], ["mouseleave", hide], ["focusin", show],
			["focusout", hide], ["click", () => preview.clear()]]) {
			row.addEventListener(name, callback);
			listeners.push([row, name, callback]);
		}
	}
	return () => {
		preview.clear();
		for (const [row, name, callback] of listeners) {
			row.removeEventListener(name, callback);
		}
	};
}
