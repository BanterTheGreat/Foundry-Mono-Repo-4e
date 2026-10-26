import { MODULE_ID, FLAG } from "./rules.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Manage the actor's shared origin actors without modifying its powers. */
class ActorOrigins extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: ["power-actor-origins"],
		window: { title: "Power origins" },
		position: { width: 420, height: "auto" },
	};

	static PARTS = {
		content: { template: `modules/${MODULE_ID}/scripts/power-activation/actor-origins.hbs` },
	};

	constructor(actor) {
		super();
		this.actor = actor;
	}

	/** Read fresh flags so concurrent sheet edits do not overwrite a stale list. */
	originActors() {
		const actors = this.actor.getFlag(MODULE_ID, FLAG)?.originActors;
		return Array.isArray(actors) ? actors.filter(uuid => typeof uuid === "string") : [];
	}

	/** Resolve labels without exposing actor names as HTML. */
	async _prepareContext() {
		return {
			actorName: this.actor.name,
			editable: this.actor.isOwner,
			origins: await Promise.all(this.originActors().map(async uuid => ({ uuid, name: (await fromUuid(uuid))?.name ?? "Missing actor" }))),
		};
	}

	/** Bind native actor drops and owner-only removals to the rendered manager. */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const content = this.element.querySelector(".power-automation-tab");
		content.addEventListener("dragover", event => event.preventDefault());
		content.addEventListener("drop", event => void this.addOrigin(event));
		this.element.querySelectorAll("[data-remove-origin]").forEach(button => button.addEventListener("click", async () => {
			if (!this.actor.isOwner) {
				return;
			}
			await this.actor.setFlag(MODULE_ID, `${FLAG}.originActors`, this.originActors().filter(uuid => uuid !== button.dataset.removeOrigin));
			await this.render({ force: true });
		}));
	}

	/** Persist a dropped actor UUID; the runtime resolves its current scene tokens. */
	async addOrigin(event) {
		event.preventDefault();
		if (!this.actor.isOwner) {
			return;
		}
		try {
			const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
			if (data.type !== "Actor") {
				throw new Error("Drop an actor from the Actors directory or a compendium.");
			}
			const actor = await Actor.implementation.fromDropData(data);
			if (!actor) {
				throw new Error("The dropped actor is unavailable.");
			}
			await this.actor.setFlag(MODULE_ID, `${FLAG}.originActors`, [...new Set([...this.originActors(), actor.uuid])]);
			await this.render({ force: true });
		} catch (error) {
			ui.notifications.error(error.message);
		}
	}
}

/** Add the shared origin manager to native actor sheets, independently of the HUD. */
export function registerActorOrigins() {
	Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
		if (app.document?.documentName !== "Actor" || !app.document.isOwner) {
			return;
		}
		const action = "dnd4ePowerOrigins";
		if (controls.some(control => control.action === action)) {
			return;
		}
		controls.push({
			label: "Origins",
			icon: "fa-solid fa-location-crosshairs",
			action,
			onClick: () => {
				if (app.document.isOwner) {
					return new ActorOrigins(app.document).render({ force: true });
				}
			},
		});
	});
}
