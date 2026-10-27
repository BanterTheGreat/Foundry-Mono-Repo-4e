import { MODULE_ID } from "./rules.js";

/** Publish one durable card while retaining native rolls for review and dice animation. */
export async function publishDamageChat(session, targets, pending = true) {
	if (!session.damageMessages.length) {
		return;
	}
	const layers = ["hit", "miss", "critical"].flatMap(outcome => {
		const type = outcome === "critical" ? "crit" : outcome === "hit" || session.sharedMissDamage ? "normal" : "miss";
		const source = session.damageMessages.find(message => message.flags[MODULE_ID].damageReview.type === type)
			?? (outcome === "miss" && !session.requiredDamageTypes.includes("miss") ? session.damageMessages[0] : null);
		const affected = targets.filter(target => target.outcome === outcome || (outcome === "miss" && target.outcome === "fumble"));
		return source && affected.some(target => Number.isFinite(target.total) && target.total > 0) ? [{ outcome, messageId: source.id, half: outcome === "miss" && session.sharedMissDamage, targets: affected }] : [];
	});
	if (!layers.length && !session.damageChat) {
		return;
	}
	const data = { name: session.item.name, sceneId: canvas.scene?.id, pending, layers };
	if (session.damageChat) {
		await session.damageChat.update({ [`flags.${MODULE_ID}.damageChat`]: data });
	} else {
		const source = session.damageMessages[0];
		session.damageChat = await ChatMessage.create({ speaker: source.speaker, whisper: source.whisper,
			blind: source.blind, content: "Target Automation damage", flags: { [MODULE_ID]: { damageChat: data } } });
	}
	for (const source of session.damageMessages) {
		if (!source.flags[MODULE_ID].damageChatParent) {
			await source.update({ [`flags.${MODULE_ID}.damageChatParent`]: session.damageChat.id });
		}
	}
}
