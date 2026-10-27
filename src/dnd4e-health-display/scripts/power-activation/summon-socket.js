import { MODULE_ID, SETTING, automationConfig } from "./rules.js";

const CHANNEL = `module.${MODULE_ID}`;
const pending = new Map();
const requests = new Map();

/** Use one elected GM, even when several GMs are connected. */
export function summonGM() {
	return game.users.activeGM;
}

/** Register request/reply handling independently of the active canvas. */
export function registerSummonSocket() {
	game.socket.on(CHANNEL, async message => {
		if (message?.type === "summonResult" && message.userId === game.user.id) {
			const entry = pending.get(message.requestId);
			if (entry && message.gmId === entry.gmId) {
				pending.delete(message.requestId);
				clearTimeout(entry.timer);
				message.error ? entry.reject(new Error(message.error)) : entry.resolve();
			}
		}
		if (message?.type !== "summonRequest" || !game.user.isGM || summonGM()?.id !== game.user.id
			|| message.gmId !== game.user.id || typeof message.requestId !== "string") {
			return;
		}
		const key = `${message.userId}:${message.requestId}`;
		if (!requests.has(key)) {
			requests.set(key, createSummonForUser(message).then(() => null, error => error.message));
			// Retain completed requests briefly so duplicate delivery cannot create twice.
			setTimeout(() => requests.delete(key), 60000).unref?.();
		}
		const error = await requests.get(key);
		game.socket.emit(CHANNEL, { type: "summonResult", userId: message.userId,
			gmId: game.user.id, requestId: message.requestId, error });
	});
}

/** Validate live documents and build the token on the GM; never accept token data from a player. */
export async function createSummonForUser(request) {
	const user = game.users.get(request.userId);
	const scene = game.scenes.get(request.sceneId);
	const item = typeof request.itemUuid === "string" ? await fromUuid(request.itemUuid) : null;
	const config = item ? automationConfig(item) : {};
	if (!user?.active || !scene || !game.settings.get(MODULE_ID, SETTING)
		|| !item?.actor || !item.testUserPermission(user, "OWNER") || !item.actor.testUserPermission(user, "OWNER")
		|| !config.enabled || config.placementMode !== "summon" || item.hasAttack) {
		throw new Error("The summoning power is unavailable or not owned by the requesting user.");
	}
	const actor = config.summonActor ? await fromUuid(config.summonActor) : null;
	const source = scene.tokens.get(request.sourceId);
	const caster = scene.tokens.get(request.casterId);
	if (!actor || actor.documentName !== "Actor" || actor.pack || !actor.testUserPermission(user, "OWNER")
		|| !source || !caster || !caster.actor?.testUserPermission(user, "OWNER")
		|| ![request.x, request.y].every(Number.isFinite)) {
		throw new Error("Summoning requires an owned world actor and valid scene tokens and placement.");
	}
	const document = await actor.getTokenDocument({ x: request.x, y: request.y,
		elevation: source.elevation, disposition: caster.disposition });
	const data = document.toObject();
	const map = scene.dimensions.sceneRect;
	if (data.x < map.x || data.y < map.y || data.x + data.width * scene.grid.size > map.x + map.width
		|| data.y + data.height * scene.grid.size > map.y + map.height) {
		throw new Error("The summoned token's footprint must fit on the scene.");
	}
	const tokens = await scene.createEmbeddedDocuments("Token", [data]);
	if (!tokens.length) {
		throw new Error("Token creation was prevented.");
	}
}

/** Await GM acknowledgement; do not retry an uncertain creation automatically. */
export async function requestSummon(activation) {
	const gm = summonGM();
	if (!gm) {
		throw new Error("A GM must be logged in to place a summoned creature.");
	}
	const request = { type: "summonRequest", requestId: activation.id, userId: game.user.id, gmId: gm.id,
		itemUuid: activation.item.uuid, sceneId: canvas.scene.id, sourceId: activation.source.id,
		casterId: activation.caster.id, x: activation.origin.x, y: activation.origin.y };
	if (gm.id === game.user.id) {
		return createSummonForUser(request);
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(request.requestId);
			reject(new Error("The GM did not confirm summon placement. Check the scene before trying again."));
		}, 15000);
		pending.set(request.requestId, { resolve, reject, timer, gmId: gm.id });
		game.socket.emit(CHANNEL, request);
	});
}
