import { MODULE_ID } from "./rules.js";

const queues = new Map();

/**
 * Persist confirmed damage, applying GM-controlled NPC damage to PCs without another dialog.
 * Only message IDs cross this seam; the GM reads the confirmed target receipts and rolls.
 */
export async function requestDamageApplication(session) {
	if (!session.item.hasDamage || !session.attackMessages.length) {
		return;
	}
	const message = session.attackMessages[0];
	const directTargets = game.user.isGM && game.users.activeGM?.id === game.user.id && session.item.actor?.type === "NPC"
		? session.attackMessages.flatMap(entry => entry.flags?.[MODULE_ID]?.targetDamageReview?.targets ?? [])
			.filter(target => game.scenes.get(canvas.scene.id)?.tokens.get(target.tokenId)?.actor?.type === "Player Character")
		: [];
	await message.update({ [`flags.${MODULE_ID}.damageApplication`]: {
		sessionId: session.id, sceneId: canvas.scene.id, itemUuid: session.item.uuid,
		// A multi-attack's creatures each use their own copy of the power.
		itemUuids: [...new Set(session.attackMessages.map(entry => entry.flags?.[MODULE_ID]?.attackResults?.itemUuid).filter(Boolean))],
		dismissed: directTargets.length > 0,
		name: session.item.name, actorName: session.item.actor.name,
		messageIds: session.attackMessages.map(message => message.id),
		damageMessageIds: session.damageMessages.map(message => message.id),
		sharedMiss: Boolean(session.sharedMissDamage), requiredDamageTypes: session.requiredDamageTypes ?? [],
	} });
	for (const target of directTargets) {
		await applyTargetDamage(message, target.key ?? target.tokenId);
	}
	if (directTargets.length && damageApplicationTargets(message).some(target =>
		message.flags[MODULE_ID].damageApplications?.[target.key]?.state !== "applied")) {
		await message.update({ [`flags.${MODULE_ID}.damageApplication.dismissed`]: false });
	}
}

/**
 * Read the entire confirmed roster, including misses that deal zero damage. Each attack on a target
 * is its own entry, keyed by `key`, so several creatures hitting one token are each applied
 * (and mitigated) separately.
 */
export function damageApplicationTargets(message) {
	const request = message.flags?.[MODULE_ID]?.damageApplication;
	if (!request?.sessionId || !Array.isArray(request.messageIds) || !request.messageIds.includes(message.id)) {
		return [];
	}
	const targets = new Map();
	for (const id of request.messageIds) {
		const source = game.messages.get(id);
		const attack = source?.flags?.[MODULE_ID]?.attackResults;
		const review = source?.flags?.[MODULE_ID]?.targetDamageReview;
		if (!source || source.author?.id !== message.author?.id || attack?.sessionId !== request.sessionId
			|| attack.sceneId !== request.sceneId || !(request.itemUuids ?? [request.itemUuid]).includes(attack.itemUuid)
			|| attack.pending || review?.pending !== false || review.sessionId !== request.sessionId) {
			return [];
		}
		for (const target of review.targets ?? []) {
			if (attack.targetIds?.includes(target.tokenId) && Number.isFinite(target.total)
				&& ["hit", "critical", "miss", "fumble", "immune"].includes(target.outcome)) {
				const key = target.key ?? target.tokenId;
				targets.set(key, { ...target, key });
			}
		}
	}
	return [...targets.values()];
}

/**
 * Allocate the confirmed total to the native roll's typed terms, preserving compound flavors.
 * Shared and per-target bonuses use the same even allocation as native untyped modifiers.
 * Negative adjustments reduce components proportionally instead of creating negative damage.
 */
export function typedTargetDamage(message, target) {
	const request = message.flags[MODULE_ID].damageApplication;
	const miss = ["miss", "fumble"].includes(target.outcome);
	const type = target.outcome === "critical" ? "crit" : miss && !request.sharedMiss ? "miss" : "normal";
	const source = (request.damageMessageIds ?? []).map(id => game.messages.get(id)).find(entry => {
		const review = entry?.flags?.[MODULE_ID]?.damageReview;
		return entry?.author?.id === message.author?.id && review?.sessionId === request.sessionId
			&& review.pending === false && review.type === type
			&& (review.attackerId === undefined || target.attackerId === undefined || review.attackerId === target.attackerId);
	});
	const roll = source?.rolls?.[0];
	const total = Math.max(0, Math.floor(target.total));
	if (!total) {
		return [];
	}
	if (!roll) {
		if (target.outcome !== "immune" && (!miss || request.sharedMiss || request.requiredDamageTypes?.includes("miss"))) {
			throw new Error("The confirmed damage roll is no longer available.");
		}
		return [[total, "physical"]];
	}
	const parts = (roll.terms ?? []).filter(term => Number.isFinite(term.total) && term.flavor)
		.map(term => [term.total, term.flavor]);
	if (!parts.length) {
		return [[total, "physical"]];
	}
	const remainder = roll.total - parts.reduce((sum, part) => sum + part[0], 0);
	for (let i = 0; i < parts.length; i++) {
		parts[i][0] += Math.trunc(remainder / parts.length) + (i < Math.abs(remainder % parts.length) ? Math.sign(remainder) : 0);
	}
	const divisor = (Number(roll.options?.divisors?.[roll.options.hitType]?.value) || 1) * (miss && request.sharedMiss ? 2 : 1);
	let accumulated = 0;
	let previous = 0;
	for (const part of parts) {
		accumulated += part[0];
		const divided = Math.floor(accumulated / divisor);
		part[0] = divided - previous;
		previous = divided;
	}
	const base = parts.reduce((sum, part) => sum + part[0], 0);
	const positiveWeight = parts.reduce((sum, part) => sum + Math.max(0, part[0]), 0);
	if (total >= base && parts.every(part => part[0] >= 0)) {
		const bonus = total - base;
		parts.forEach((part, i) => { part[0] += Math.floor(bonus / parts.length) + (i < bonus % parts.length ? 1 : 0); });
	} else {
		let allocated = 0;
		let weight = 0;
		parts.forEach(part => {
			weight += Math.max(0, part[0]);
			const share = Math.floor(total * weight / positiveWeight);
			part[0] = share - allocated;
			allocated = share;
		});
	}
	return parts.filter(part => part[0] > 0);
}

/** Match DnD4e 0.9.3 applyDamage: temp HP first, then HP down to negative bloodied. */
export function projectDamage(actor, amount) {
	const hp = actor.system.attributes.hp;
	const temp = parseInt(actor.system.attributes.temphp.value) || 0;
	const absorbed = Math.min(temp, amount);
	const loss = amount - absorbed;
	const after = loss > 0 ? Math.min(hp.max, Math.max(-actor.system.details.bloodied, hp.value - loss)) : hp.value;
	return { before: hp.value, after, max: hp.max, tempBefore: temp, tempAfter: temp - absorbed };
}

/** Resolve live documents and native mitigation for both the preview and the actual click. */
export async function prepareDamageTarget(message, target) {
	const request = message.flags[MODULE_ID].damageApplication;
	const token = game.scenes.get(request.sceneId)?.tokens.get(target.tokenId);
	const receipt = message.flags[MODULE_ID].damageApplications?.[target.key ?? target.tokenId];
	const label = { hit: "HIT", critical: "CRIT", miss: "MISS", fumble: "CRIT FAIL", immune: "IMMUNE" }[target.outcome];
	// Only a multi-attack names the attacker, since a single attack has no other candidates.
	const attackerName = target.key && target.key !== target.tokenId
		? game.scenes.get(request.sceneId)?.tokens.get(target.attackerId)?.name ?? "Attacker" : "";
	if (!token?.actor) {
		return { ...target, label, attackerName, name: token?.name ?? "Missing token", unavailable: true, status: "Token unavailable", disabled: true };
	}
	const actor = token.actor;
	const raw = Math.max(0, Math.floor(target.total));
	const amount = receipt?.state === "applied" ? receipt.amount
		: raw > 0 ? Math.max(0, Math.floor(await actor.calcDamageInner(typedTargetDamage(message, target)))) : 0;
	if (!Number.isFinite(amount)) {
		throw new Error(`Could not calculate damage for ${token.name}.`);
	}
	const applied = receipt?.state === "applied";
	const uncertain = receipt && !applied;
	const health = applied ? receipt.health : projectDamage(actor, amount);
	return { ...target, ...health, attackerName, name: token.name, img: token.texture?.src, actor, amount,
		raw, mitigated: amount !== raw, applied, uncertain, disabled: Boolean(receipt),
		status: applied ? "Applied" : uncertain ? "Check HP manually" : "Apply",
		hasTemp: health.tempBefore > 0, beforePercent: Math.max(0, Math.min(100, health.before / health.max * 100)),
		afterPercent: Math.max(0, Math.min(100, health.after / health.max * 100)),
		label };
}

/**
 * Serialize actor mutations across popups. A persisted claim prevents duplicate clicks,
 * reopen/reload duplicates and GM failover retries. An uncertain write requires manual review.
 */
export async function applyTargetDamage(message, key) {
	if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) {
		throw new Error("Only the active GM can apply this damage.");
	}
	const request = message.flags?.[MODULE_ID]?.damageApplication;
	const tokenId = damageApplicationTargets(message).find(entry => entry.key === key)?.tokenId ?? key;
	const actor = game.scenes.get(request?.sceneId)?.tokens.get(tokenId)?.actor;
	const queueKey = actor?.uuid ?? `${message.id}:${tokenId}`;
	const previous = queues.get(queueKey) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(async () => {
		if (game.users.activeGM?.id !== game.user.id) {
			throw new Error("The active GM changed. Reopen the damage review on that GM.");
		}
		if (message.flags[MODULE_ID].damageApplications?.[key]) {
			return;
		}
		const target = damageApplicationTargets(message).find(entry => entry.key === key);
		if (!target) {
			throw new Error("This target no longer has confirmed damage.");
		}
		const prepared = await prepareDamageTarget(message, target);
		if (game.users.activeGM?.id !== game.user.id) {
			throw new Error("The active GM changed before damage could be applied.");
		}
		if (prepared.disabled) {
			throw new Error(`${prepared.name}: ${prepared.status}.`);
		}
		const path = `flags.${MODULE_ID}.damageApplications.${key}`;
		const health = projectDamage(prepared.actor, prepared.amount);
		await message.update({ [path]: { state: "applying", amount: prepared.amount, health, gmId: game.user.id } });
		try {
			if (prepared.amount > 0) {
				await prepared.actor.applyDamage(prepared.amount);
				if (prepared.actor.system.attributes.hp.value !== health.after
					|| Number(prepared.actor.system.attributes.temphp.value) !== health.tempAfter) {
					throw new Error("Damage was changed or prevented by another module. Check this token's HP manually.");
				}
			}
			await message.update({ [path]: { state: "applied", amount: prepared.amount, health, gmId: game.user.id } });
		} catch (error) {
			// Keep the persisted claim: an interrupted update must never deal damage twice.
			throw new Error(`${prepared.name}: ${error.message} Check HP before applying anything manually.`);
		}
	});
	queues.set(queueKey, next);
	try {
		return await next;
	} finally {
		if (queues.get(queueKey) === next) {
			queues.delete(queueKey);
		}
	}
}
