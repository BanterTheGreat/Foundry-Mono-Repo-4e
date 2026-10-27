import { MODULE_ID, SETTING, automationConfig } from "./rules.js";
import { loadSystem } from "./system-adapter.js";

const CHANNEL = `module.${MODULE_ID}`;
const pending = new Map();
const queues = new Map();

/** Serialize updates to a session so an earlier request cannot recreate removed effects. */
function enqueue(request) {
	const key = `${request.userId}:${request.sessionId}`;
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(() => reconcileAttackEffects(request));
	queues.set(key, next);
	void next.finally(() => {
		if (queues.get(key) === next) {
			queues.delete(key);
		}
	}).catch(() => {});
	return next;
}

/** Register GM-authoritative reconciliation with an awaited acknowledgement to the player. */
export function registerAttackEffects() {
	game.socket.on(CHANNEL, async request => {
		if (request?.type === "attackEffectsResult" && request.userId === game.user.id) {
			const entry = pending.get(request.requestId);
			if (entry && entry.gmId === request.gmId) {
				pending.delete(request.requestId);
				clearTimeout(entry.timer);
				request.error ? entry.reject(new Error(request.error)) : entry.resolve();
			}
		}
		if (request?.type !== "attackEffectsRequest" || !game.user.isGM
			|| game.users.activeGM?.id !== game.user.id || request.gmId !== game.user.id) {
			return;
		}
		try {
			await enqueue(request);
			game.socket.emit(CHANNEL, { type: "attackEffectsResult", userId: request.userId,
				requestId: request.requestId, gmId: game.user.id });
		} catch (error) {
			game.socket.emit(CHANNEL, { type: "attackEffectsResult", userId: request.userId,
				requestId: request.requestId, gmId: game.user.id, error: error.message });
		}
	});
}

/**
 * Request a reconciliation from persisted chat rolls, never client-supplied effect data.
 * The GM verifies the requesting author owns the originating power and session messages.
 */
export async function syncAttackEffects(activation) {
	if (!game.settings.get("dnd4e", "autoApplyEffects") || !activation.item.effects?.size) {
		return;
	}
	const gm = game.users.activeGM;
	const request = { type: "attackEffectsRequest", requestId: foundry.utils.randomID(), gmId: gm?.id,
		userId: game.user.id, sessionId: activation.id, sceneId: canvas.scene.id, itemUuid: activation.item.uuid,
		messageIds: activation.attackMessages.map(message => message.id) };
	if (game.user.isGM || !gm) {
		return enqueue(request);
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(request.requestId);
			reject(new Error("The GM did not confirm attack effects. Retry confirmation to reconcile them."));
		}, 15000);
		pending.set(request.requestId, { resolve, reject, timer, gmId: gm.id });
		game.socket.emit(CHANNEL, request);
	});
}

/** Validate persisted session ownership and derive effects from current outcomes and native conditions. */
export async function reconcileAttackEffects(request) {
	const user = game.users.get(request.userId);
	const scene = game.scenes.get(request.sceneId);
	const item = typeof request.itemUuid === "string" ? await fromUuid(request.itemUuid) : null;
	if ((!game.user.isGM && game.user.id !== request.userId) || !user?.active || !scene || !game.settings.get(MODULE_ID, SETTING)
		|| !item?.hasAttack || !automationConfig(item).enabled || !item.testUserPermission(user, "OWNER")
		|| !item.actor?.testUserPermission(user, "OWNER") || typeof request.sessionId !== "string"
		|| !Array.isArray(request.messageIds) || !request.messageIds.length) {
		throw new Error("This attack's effects cannot be updated by the requesting user.");
	}
	const messages = request.messageIds.map(id => game.messages.get(id));
	for (const message of messages) {
		const context = message?.flags?.[MODULE_ID]?.attackResults;
		if (!message || message.author?.id !== user.id || context?.sessionId !== request.sessionId
			|| context.sceneId !== scene.id || context.itemUuid !== item.uuid || !context.effectsManaged
			|| !Array.isArray(context.targetIds)) {
			throw new Error("Attack messages no longer match this effect session.");
		}
	}
	const casterId = messages[0].flags[MODULE_ID].attackResults.casterId;
	const caster = scene.tokens.get(casterId);
	if (!caster || caster.actor?.uuid !== item.actor.uuid
		|| messages.some(message => message.flags[MODULE_ID].attackResults.casterId !== casterId)) {
		throw new Error("The attack's caster is no longer available.");
	}
	// Include removed targets so only this session's stale effects can be deleted there.
	const actors = new Map([...scene.tokens].filter(token => token.actor).map(token => [token.actor.uuid, token.actor]));
	actors.set(item.actor.uuid, item.actor);
	const desired = new Map();
	const add = (token, condition) => {
		if (!token?.actor) {
			return;
		}
		for (const effect of item.effects) {
			if (effect.system.powerEffectType !== condition) {
				continue;
			}
			const key = `${token.id}:${condition}:${effect.id}`;
			desired.set(`${token.actor.uuid}:${key}`, { key, token, effect, condition });
		}
	};
	add(caster, "self");
	add(caster, "selfAfterAttack");
	const seen = new Set();
	for (const message of messages) {
		const context = message.flags[MODULE_ID].attackResults;
		for (const roll of message.rolls ?? []) {
			const attack = roll.options?.multirollData;
			if (!attack || !context.targetIds.includes(attack.targetID) || seen.has(attack.targetID)) {
				continue;
			}
			seen.add(attack.targetID);
			const target = scene.tokens.get(attack.targetID);
			if (!target) {
				continue;
			}
			add(target, "all");
			const disposition = item.actor.token?.disposition || item.actor.prototypeToken.disposition || null;
			if (disposition !== null) {
				add(target, target.disposition === disposition ? "allies" : "enemies");
			}
			const outcome = ["critical", "fumble", "immune"].includes(attack.critstate) ? attack.critstate : attack.hitstate;
			if (["hit", "critical", "miss", "fumble"].includes(outcome)) {
				const condition = ["hit", "critical"].includes(outcome) ? "hit" : "miss";
				add(target, condition);
				add(target, "hitOrMiss");
				add(caster, condition === "hit" ? "selfHit" : "selfMiss");
			}
		}
	}
	if (!game.user.isGM) {
		const affected = new Set([...desired.values()].map(entry => entry.token.actor));
		for (const actor of actors.values()) {
			if ([...actor.effects].some(effect => effect.flags?.[MODULE_ID]?.attackEffect?.sessionId === request.sessionId
				&& effect.flags[MODULE_ID].attackEffect.itemUuid === item.uuid)) {
				affected.add(actor);
			}
		}
		if ([...affected].some(actor => !actor.isOwner)) {
			throw new Error("A GM must be logged in to update effects on targets you do not own.");
		}
	}
	const existing = new Set();
	for (const actor of actors.values()) {
		const stale = [];
		for (const effect of actor.effects) {
			const tag = effect.flags?.[MODULE_ID]?.attackEffect;
			if (tag?.sessionId !== request.sessionId || tag.itemUuid !== item.uuid) {
				continue;
			}
			const key = `${actor.uuid}:${tag.key}`;
			if (!desired.has(key) || existing.has(key)) {
				stale.push(effect.id);
			} else {
				existing.add(key);
			}
		}
		if (stale.length) {
			await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
		}
	}
	if (!game.settings.get("dnd4e", "autoApplyEffects")) {
		return;
	}
	const utils = await loadSystem();
	for (const [key, entry] of desired) {
		if (existing.has(key)) {
			continue;
		}
		const tagged = { toObject() {
			const data = entry.effect.toObject();
			data.flags ??= {};
			data.flags[MODULE_ID] = { ...data.flags[MODULE_ID], attackEffect: {
				sessionId: request.sessionId, itemUuid: item.uuid, key: entry.key,
			} };
			return data;
		} };
		await utils.applyEffectsToTokens([tagged], [{ id: entry.token.id, actor: entry.token.actor }], entry.condition, item.actor);
	}
}
