import { Logger } from "../../shared/logger.js";
import { TRIGGER_PROMPT_FLAG } from "../trigger-prompts/constants.js";
import { toTriggerAttackOutcome } from "./player-defense-outcome.js";

// EVERYTHING HERE SHOULD ONLY BE CALLED ON THE GM'S INSTANCE USING SOCKETLIB.
/**
 * Performs GM-authoritative chat-message mutations requested through SocketLib.
 */
export class SocketHelper {
    updateQueue = Promise.resolve();

    /**
     * @param {string} id
     */
    static async deleteMessage(id) {
        const message = game.messages.get(id);
        if (message) {
            await message.delete();
        }
    }

    /**
     * @param {string} id
     * @param {object} newMessage
     */
    static async updateMessage(id, newMessage) {
        const message = game.messages.get(id);
        if (message) {
            await message.update({ ...newMessage });
        }
    }

    /**
     * Serializes message mutations to prevent concurrent updates from overwriting each other.
     *
     * @param {() => Promise<unknown>} update
     * @returns {Promise<unknown>}
     */
    static #queueUpdate(update) {
        const queuedUpdate = game.SocketHelper.updateQueue.then(update);
        game.SocketHelper.updateQueue = queuedUpdate.catch(error => Logger.error("Queued chat-message update failed", { error }));
        return queuedUpdate;
    }

    /**
     * Marks a target's one allowed dialog attempt.
     *
     * @param {string} messageId
     * @param {string} targetId
     * @returns {Promise<boolean>}
     */
    static async attemptDefenseDialog(messageId, targetId) {
        return SocketHelper.#queueUpdate(async () => {
            const message = game.messages.get(messageId);
            const defense = message?.flags?.playerDefense;
            const targets = defense?.targets;
            const target = targets?.find(entry => entry.id === targetId);

            if (!target || target.dialogAttempted) {
                return false;
            }

            target.dialogAttempted = true;
            await message.update({ flags: { ...message.flags, playerDefense: { ...defense, targets } } });
            Logger.info("Attempted defense dialog", { messageId, targetId });
            return true;
        });
    }

    /**
     * Replaces a target's awaiting placeholder with its defense result and rolls
     * each applicable damage type once after every defense has resolved.
     *
     * @param {string} messageId
     * @param {string} targetId
     * @param {"normal"|"critical"|"miss"} outcome
     * @param {string} resultHtml
     * @returns {Promise<boolean>}
     */
    static async resolveDefenseTarget(messageId, targetId, outcome, resultHtml) {
        return SocketHelper.#queueUpdate(async () => {
            const message = game.messages.get(messageId);
            const defense = message?.flags?.playerDefense;
            const targets = defense?.targets;
            const target = targets?.find(entry => entry.id === targetId);

            if (!target || target.resolved || !["normal", "critical", "miss"].includes(outcome)) {
                return false;
            }

            const marker = `<span data-player-defense-result="${targetId}"><em>Awaiting defense...</em></span>`;
            const content = message.content.replace(marker, resultHtml);
            target.resolved = true;
            target.outcome = outcome;

            const damageRolled = defense.damageRolled ?? { normal: false, critical: false, miss: false };
            const damageGroups = SocketHelper.#getDamageGroups(targets, defense, damageRolled);
            damageGroups.forEach(group => damageRolled[group] = true);
            await message.update({ content, flags: { ...message.flags, playerDefense: { ...defense, targets, damageRolled } } });
            Logger.info("Resolved defense target", { messageId, targetId, outcome });

            await game.TriggerPrompts?.handleActiveDefenseOutcome({
                attackerActorId: defense.attackerId,
                attackerTokenId: defense.attackerTokenId,
                sceneId: defense.sceneId,
                targetActorId: target.actorId,
                targetTokenId: target.tokenId,
                targetSceneId: target.sceneId,
                defenseType: target.defenseStat,
                attackRange: defense.attackRange,
            }, toTriggerAttackOutcome(outcome));

            for (const group of damageGroups) {
                await SocketHelper.#rollDefenseDamage(defense, group, messageId);
            }
            return true;
        });
    }

    /**
     * Atomically marks a trigger prompt as used before its selected item is
     * posted to chat.
     *
     * @param {string} messageId
     * @param {string} itemId
     * @returns {Promise<object|null>}
     */
    static async claimTriggerPrompt(messageId, itemId) {
        return SocketHelper.#queueUpdate(async () => {
            const message = game.messages.get(messageId);
            const prompt = message?.flags?.[TRIGGER_PROMPT_FLAG];
            const allowedItemIds = prompt?.choices?.map(choice => choice.itemId) ?? [prompt?.itemId];
            if (!prompt || prompt.used || !allowedItemIds.includes(itemId)) {
                return null;
            }

            prompt.used = true;
            await message.update({ flags: { ...message.flags, [TRIGGER_PROMPT_FLAG]: prompt } });
            return { ...prompt, itemId };
        });
    }

    /**
     * Deletes a still-unclaimed trigger prompt after its response window ends.
     * The same serialized queue as prompt claims ensures a choice made at the
     * deadline wins over expiry.
     *
     * @param {string} messageId
     *   Trigger prompt message to expire.
     * @returns {Promise<boolean>}
     *   Whether an unclaimed prompt was deleted.
     */
    static async expireTriggerPrompt(messageId) {
        return SocketHelper.#queueUpdate(async () => {
            const message = game.messages.get(messageId);
            const prompt = message?.flags?.[TRIGGER_PROMPT_FLAG];
            if (!prompt || prompt.used) {
                return false;
            }

            await message.delete();
            return true;
        });
    }

    /**
     * Returns unrolled damage groups once all defense rolls have resolved.
     *
     * @param {object[]} targets
     * @param {object} defense
     * @param {{normal: boolean, critical: boolean, miss: boolean}} damageRolled
     * @returns {Array<"normal"|"critical"|"miss">}
     */
    static #getDamageGroups(targets, defense, damageRolled) {
        if (!targets.every(target => target.resolved)) {
            return [];
        }

        const groups = [];
        if (defense.hasDamage && targets.some(target => target.outcome === "normal") && !damageRolled.normal) {
            groups.push("normal");
        }
        if (defense.hasDamage && targets.some(target => target.outcome === "critical") && !damageRolled.critical) {
            groups.push("critical");
        }
        if (defense.hasDamage && defense.hasMissDamage && targets.some(target => target.outcome === "miss") && !damageRolled.miss) {
            groups.push("miss");
        }
        return groups;
    }

    /**
     * Starts the appropriate DnD4e damage workflow for a completed attack.
     * Critical and miss damage use the system dialog because v0.7.14 exposes no
     * supported API to select either variant programmatically.
     *
     * @param {object} defense
     * @param {"normal"|"critical"|"miss"} group
     * @param {string} messageId
     * @returns {Promise<void>}
     */
    static async #rollDefenseDamage(defense, group, messageId) {
        const attacker = game.actors.get(defense.attackerId);
        const item = attacker?.items.get(defense.itemId) ?? attacker?.items.find(candidate => candidate.name === defense.itemName);
        if (!item) {
            Logger.error("Could not find the attacking item for defense damage", { messageId, attackerId: defense.attackerId, itemId: defense.itemId, itemName: defense.itemName, group });
            return;
        }

        Logger.info("Rolling defense damage", { messageId, attackerId: attacker.id, itemId: item.id, group });
        if (group === "normal") {
            await item.rollDamage({ fastForward: true });
            return;
        }

        if (group === "miss") {
            await SocketHelper.#rollMissDamage(item, defense.missDamage);
            return;
        }

        await item.rollDamage();
    }

    /**
     * Supplies the miss configuration captured from the attack hook while the
     * legacy DnD4e damage dialog is being constructed. The embedded actor item
     * does not always retain this data, but its dialog requires it to display
     * the Miss action.
     *
     * @param {Item} item
     * @param {{halfDamage?: boolean, formula?: string}} missDamage
     * @returns {Promise<unknown>}
     */
    static async #rollMissDamage(item, missDamage = {}) {
        const miss = foundry.utils.mergeObject(foundry.utils.deepClone(item.system.miss), missDamage, { inplace: false });
        const missDamageItem = item.clone({ system: { miss } }, { keepId: true });
        return missDamageItem.rollDamage();
    }
}
