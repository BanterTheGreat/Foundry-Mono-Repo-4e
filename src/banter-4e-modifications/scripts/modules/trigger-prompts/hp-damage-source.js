import { attackRangeOf } from "./combat-events.js";

/**
 * Find the attacker in a damage receipt persisted before HP application.
 * Manual HP edits have no reliable attacker and deliberately return null.
 * Group attacks key receipts by attacker:target, rather than target alone.
 *
 * @param {Iterable<object>} messages Chat messages on this client.
 * @param {{sceneId: string, tokenId: string, oldHp: number, newHp: number}} change
 * @returns {{sceneId: string, tokenId: string}|null}
 */
export function findHpDamageSource(messages, { sceneId, tokenId, oldHp, newHp }) {
  return findHpDamage(messages, { sceneId, tokenId, oldHp, newHp })?.attacker ?? null;
}

/**
 * Read a matching receipt's attacker and original power range, when available.
 * Missing range data deliberately cannot satisfy a melee-only restriction.
 *
 * @param {Iterable<object>} messages
 * @param {object} change
 * @returns {{attacker: object, attackRange: string|null}|null}
 */
export function findHpDamage(messages, { sceneId, tokenId, oldHp, newHp }) {
  for (const message of messages) {
    const flags = message.flags?.["dnd4e-health-display"];
    if (flags?.damageApplication?.sceneId !== sceneId) {
      continue;
    }
    for (const [key, receipt] of Object.entries(flags.damageApplications ?? {})) {
      if (key !== tokenId && !key.endsWith(`:${tokenId}`)) {
        continue;
      }
      if (receipt.state !== "applying" || receipt.health?.before !== oldHp || receipt.health?.after !== newHp) {
        continue;
      }
      const attackerId = key === tokenId ? flags.attackResults?.casterId ?? message.speaker?.token : key.slice(0, -(tokenId.length + 1));
      if (attackerId) {
        const sourceMessage = [...(flags.damageApplication.messageIds ?? [])]
          .map(id => globalThis.game?.messages?.get(id))
          .find(entry => entry?.flags?.["dnd4e-health-display"]?.attackResults?.casterId === attackerId) ?? message;
        const itemUuid = sourceMessage.flags?.["dnd4e-health-display"]?.attackResults?.itemUuid ?? flags.damageApplication.itemUuid;
        const item = itemUuid ? globalThis.fromUuidSync?.(itemUuid) : null;
        return { attacker: { sceneId, tokenId: attackerId }, attackRange: sourceMessage.flags?.["dnd4e-health-display"]?.attackResults?.triggerMetadata?.attackRange ?? (item ? attackRangeOf(item) : null), damageTypes: receipt.damageTypes ?? [], amount: receipt.amount };
      }
    }
  }
  return null;
}
