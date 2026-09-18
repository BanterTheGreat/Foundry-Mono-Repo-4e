import { getTeamDisplayData } from "./team-display-data.js";

const MODULE_ID = "dnd4e-health-display";
const SHOW_SETTING = "showTeamDisplay";
const POSITION_SETTING = "teamDisplayPosition";
const TEMPLATE_PATH = `modules/${MODULE_ID}/scripts/team-display/team-display.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Register client settings owned by the independent team display. */
export function registerTeamDisplaySettings() {
	game.settings.register(MODULE_ID, SHOW_SETTING, {
		name: "Show team display",
		hint: "Show a separate party health and healing-surge display.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: (enabled) => {
			if (enabled) {
				renderTeamDisplay();
			} else {
				closeTeamDisplay();
			}
		},
	});

	game.settings.register(MODULE_ID, POSITION_SETTING, {
		name: "Team display position",
		hint: "Saved screen position of the separate team display.",
		scope: "client",
		config: false,
		type: Object,
		default: { top: null, left: null },
	});
}

/** Register the team display lifecycle and refresh hooks. */
export function registerTeamDisplay() {
	Hooks.on("canvasReady", renderTeamDisplay);
	Hooks.on("createToken", renderTeamDisplay);
	Hooks.on("updateToken", renderTeamDisplay);
	Hooks.on("deleteToken", renderTeamDisplay);
	Hooks.on("updateActor", renderTeamDisplay);
	Hooks.on("updateUser", renderTeamDisplay);
	Hooks.on("canvasTearDown", closeTeamDisplay);

	renderTeamDisplay();
}

/** Render the independent display when it is enabled and a scene is ready. */
function renderTeamDisplay() {
	if (!game.settings.get(MODULE_ID, SHOW_SETTING) || !canvas?.ready) {
		return;
	}

	if (!ui.Dnd4eTeamDisplay) {
		ui.Dnd4eTeamDisplay = new TeamDisplay();
		ui.Dnd4eTeamDisplay.render(true);
		return;
	}

	ui.Dnd4eTeamDisplay.render();
}

/** Close the team display and clear its UI reference. */
function closeTeamDisplay() {
	const display = ui.Dnd4eTeamDisplay;
	ui.Dnd4eTeamDisplay = null;
	void display?.close();
}

class TeamDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "dnd4e-info-team-display",
		tag: "aside",
		classes: ["dnd4e-info-team-display"],
		position: {
			top: 16,
			left: 400,
			width: 294,
			height: "auto",
		},
		dragResizable: false,
		window: { frame: false },
	};

	static PARTS = {
		main: { template: TEMPLATE_PATH },
	};

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return foundry.utils.mergeObject(context, getTeamDisplayData(getTeamTokens()));
	}

	/** Place the frameless display directly in the document body. */
	_insertElement(element) {
		document.body.appendChild(element);
		this.ensureFloatingElement();
	}

	/** Restore drag state after every render. */
	_onRender(context, options) {
		super._onRender(context, options);
		this.ensureFloatingElement();
		this.initializeDrag();
		this.initializeMemberInteractions();
		this.restorePosition();
	}

	/** Keep this independent display out of Foundry's document-flow layout. */
	ensureFloatingElement() {
		if (!this.element) {
			return;
		}

		// this.element.style.setProperty("position", "fixed", "important");
		// this.element.style.setProperty("right", "auto", "important");
		// this.element.style.setProperty("bottom", "auto", "important");
		// this.element.style.setProperty("z-index", "90", "important");
	}

	/** Make the team header the drag handle. */
	initializeDrag() {
		const handle = this.element.querySelector(".dnd4e-info-team-display__header");
		if (!handle) {
			return;
		}

		handle.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) {
				return;
			}

			const startX = event.clientX;
			const startY = event.clientY;
			const startLeft = this.position.left;
			const startTop = this.position.top;
			const move = (moveEvent) => this.setPosition({
				left: startLeft + moveEvent.clientX - startX,
				top: startTop + moveEvent.clientY - startY,
			});
			const release = async () => {
				document.removeEventListener("pointermove", move);
				document.removeEventListener("pointerup", release);
				await game.settings.set(MODULE_ID, POSITION_SETTING, {
					left: this.position.left,
					top: this.position.top,
				});
			};

			event.preventDefault();
			document.addEventListener("pointermove", move);
			document.addEventListener("pointerup", release);
		});
	}

	/** Bind token selection and actor-sheet controls for each team member. */
	initializeMemberInteractions() {
		const members = this.element.querySelectorAll(".dnd4e-info-team-display__member");
		for (const member of members) {
			member.addEventListener("click", () => this.selectMemberToken(member.dataset.tokenId));
			member.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				this.openMemberSheet(member.dataset.tokenId, member.dataset.actorId);
			});
			member.addEventListener("keydown", (event) => {
				if (event.key !== "Enter" && event.key !== " ") {
					return;
				}

				event.preventDefault();
				this.selectMemberToken(member.dataset.tokenId);
			});
		}
	}

	/** Select a displayed token when the current user is permitted to control it. */
	selectMemberToken(tokenId) {
		const token = canvas.tokens?.get(tokenId);
		if (!token?.isVisible || !token.document.isOwner) {
			return;
		}

		try {
			token.control({ releaseOthers: true });
		} catch (error) {
			console.warn(`${MODULE_ID} | Could not select team member token.`, error);
		}
	}

	/** Open the character sheet for a displayed party member. */
	openMemberSheet(tokenId, actorId) {
		const actor = canvas.tokens?.get(tokenId)?.actor || game.actors?.get(actorId);
		if (!actor?.sheet) {
			return;
		}

		actor.sheet.render(true);
	}

	/** Restore the user's last saved display position. */
	restorePosition() {
		const position = game.settings.get(MODULE_ID, POSITION_SETTING);
		if (position?.left != null && position?.top != null) {
			this.setPosition(position);
		}
	}
}

/**
 * Resolve the party tokens using the legacy actor-HUD selection policy.
 *
 * @returns {Token[]}
 */
function getTeamTokens() {
	const activePlayers = game.users.filter((user) => user.active && !user.isGM);
	const viewingUser = game.user;
	const isGM = viewingUser.isGM;
	const tokens = canvas.tokens?.placeables ?? [];

	if (!activePlayers.length) {
		return tokens.filter((token) => token.actor?.type === "Player Character");
	}

	let selfToken = null;
	if (!isGM) {
		if (viewingUser.character) {
			selfToken = tokens.find((token) => token.actor?.id === viewingUser.character.id);
		}

		if (!selfToken) {
			selfToken = tokens.find((token) => token.actor && token.document.testUserPermission(viewingUser, "OWNER"));
		}
	}

	const teamTokens = [];
	const usedActorIds = new Set();
	for (const user of activePlayers) {
		let token = null;
		if (user.character) {
			token = tokens.find((candidate) => candidate.actor?.id === user.character.id);
		}

		if (!token) {
			token = tokens.find((candidate) => candidate.actor && candidate.document.testUserPermission(user, "OWNER"));
		}

		if (!token || usedActorIds.has(token.actor.id)) {
			continue;
		}

		if (!isGM && selfToken?.actor?.id === token.actor.id) {
			continue;
		}

		teamTokens.push(token);
		usedActorIds.add(token.actor.id);
	}

	return teamTokens;
}
