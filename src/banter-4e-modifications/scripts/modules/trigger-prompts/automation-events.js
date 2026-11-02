import { createAttackResolvedEvent } from "./combat-events.js";

/**
 * Read confirmed Target Automation verdicts, never preliminary totals. Attack
 * metadata is snapshotted from the effective rolled power (including variants).
 * No current target selection, parsed chat HTML or later-edited Item is used.
 */
export function confirmedAutomationEvents(message) {
  const attack = message.flags?.["dnd4e-health-display"]?.attackResults;
  if (!attack?.sessionId || attack.pending !== false) {
    return [];
  }
  const native = (message.rolls ?? []).map(roll => {
    const data = roll.options?.multirollData;
    return { tokenId: data?.targetID, outcome: ["critical", "fumble", "immune"].includes(data?.critstate) ? data.critstate : data?.hitstate };
  });
  const defenses = message.flags?.playerDefense?.automationManaged
    ? (message.flags.playerDefense.targets ?? []).filter(target => target.resolved).map(target => ({ tokenId: target.tokenId, outcome: target.outcome === "normal" ? "hit" : target.outcome })) : [];
  return [...native, ...defenses].filter(target => attack.targetIds?.includes(target.tokenId) && ["hit", "critical", "miss", "fumble"].includes(target.outcome))
    .map(target => createAttackResolvedEvent({
      attackId: message.id,
      attacker: { sceneId: attack.sceneId, tokenId: attack.casterId },
      target: { sceneId: attack.sceneId, tokenId: target.tokenId },
      outcome: ["hit", "critical"].includes(target.outcome) ? "hit" : "miss",
      isCritical: target.outcome === "critical",
      attackRange: attack.triggerMetadata?.attackRange,
      defenseType: attack.triggerMetadata?.defenseTypes?.[target.tokenId] ?? attack.triggerMetadata?.defenseType,
      isOpportunity: attack.triggerMetadata?.isOpportunity,
      itemUuid: attack.itemUuid,
    }));
}
