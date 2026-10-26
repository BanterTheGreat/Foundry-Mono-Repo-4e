import { MODULE_ID, automationConfig } from "./rules.js";

const CHANNEL = `module.${MODULE_ID}`;

/** Resolve the aiming user's configured Foundry colour for PIXI drawing. */
export function aimingColor(user) {
	const color = String(user?.color ?? "");
	return /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : 0xf5d787;
}

/** Ephemeral area geometry shared with other clients, without changing their targets. */
export class SharedAreaPreview {
	constructor() {
		this.remote = new Map();
		this.sequence = 0;
	}

	/** Register once at ready; heartbeats recover previews after joining or changing scenes. */
	register() {
		game.socket.on(CHANNEL, message => this.receive(message));
		Hooks.on("canvasTearDown", () => {
			this.clear();
			for (const userId of this.remote.keys()) {
				this.remove(userId);
			}
		});
		this.heartbeat = window.setInterval(() => {
			if (this.local) {
				this.send();
			}
			for (const [userId, preview] of this.remote) {
				if (Date.now() - preview.updated > 5000 || !game.users.get(userId)?.active) {
					this.remove(userId);
				}
			}
		}, 1000);
	}

	/** Coalesce pointer updates into at most one network message per 60 milliseconds. */
	show(activation) {
		const rectangles = activation.areaRectangles();
		if (!rectangles.length) {
			this.clear();
			return;
		}
		this.local = {
			sceneId: canvas.scene.id, sourceId: (activation.caster ?? activation.source).id, rectangles,
			hole: activation.range.shape === "closeBurst" && !automationConfig(activation.item).includeCaster
				? { x: activation.source.x, y: activation.source.y, w: activation.source.w, h: activation.source.h } : null,
		};
		this.pending ??= window.setTimeout(() => {
			this.pending = null;
			this.send();
		}, 60);
	}

	/** Broadcast only transient, serializable geometry, never documents or selected targets. */
	send() {
		game.socket.emit(CHANNEL, {
			type: "areaPreview", userId: game.user.id, sequence: ++this.sequence, preview: this.local,
		});
	}

	/** Remove the local user's shared preview immediately, including any queued movement. */
	clear() {
		window.clearTimeout(this.pending);
		this.pending = null;
		if (this.local) {
			this.local = null;
			this.send();
		}
	}

	/**
	 * Receive module-socket geometry. Render only on the same scene for an active user
	 * who owns the visible source token. Each user has an independent disposable overlay.
	 */
	receive(message) {
		if (message?.type !== "areaPreview" || message.userId === game.user.id) {
			return;
		}
		const user = game.users.get(message.userId);
		const existing = this.remote.get(message.userId);
		if (!user?.active || !Number.isSafeInteger(message.sequence) || message.sequence <= (existing?.sequence ?? -1)) {
			return;
		}
		const preview = message.preview;
		const source = canvas.tokens?.get(preview?.sourceId);
		if (!preview || !canvas.ready || preview.sceneId !== canvas.scene.id || !source?.visible
			|| !source.actor?.testUserPermission(user, "OWNER") || !Array.isArray(preview.rectangles) || !preview.rectangles.length || preview.rectangles.length > 1000
			|| !preview.rectangles.every(validRectangle)
			|| (preview.hole && !validRectangle(preview.hole))) {
			this.remove(message.userId);
			return;
		}
		const graphics = existing?.graphics ?? canvas.interface.addChild(new PIXI.Graphics());
		graphics.eventMode = "none";
		graphics.clear();
		const color = aimingColor(user);
		graphics.lineStyle(2, color).beginFill(color, .18);
		for (const { x, y, w, h } of preview.rectangles) {
			graphics.drawRect(x, y, w, h);
		}
		if (preview.hole) {
			const hole = preview.hole;
			graphics.beginHole().drawRect(hole.x, hole.y, hole.w, hole.h).endHole();
		}
		graphics.endFill();
		this.remote.set(message.userId, { graphics, sequence: message.sequence, updated: Date.now() });
	}

	/** Destroy one remote user's overlay on cancellation, disconnect, expiry or scene change. */
	remove(userId) {
		this.remote.get(userId)?.graphics.destroy();
		this.remote.delete(userId);
	}
}

/** Reject malformed socket geometry before passing it to PIXI. */
function validRectangle(rectangle) {
	return rectangle && [rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(Number.isFinite)
		&& rectangle.w > 0 && rectangle.h > 0;
}

export const sharedAreaPreview = new SharedAreaPreview();
