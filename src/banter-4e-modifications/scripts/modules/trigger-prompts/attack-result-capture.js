/**
 * Captures one DnD4e attack until its matching roll message supplies the
 * outcome total. Player Defense may discard that capture when it replaces the
 * system message with its own resolved outcome.
 */
export class AttackResultCapture {
  constructor() {
    this.pendingAttackContext = null;
  }

  /**
   * Records the portion of the DnD4e attack hook needed to resolve each target.
   *
   * @param {{item: Item, target: object, speaker: object, sceneId: string|null}} attack
   * @returns {void}
   */
  capture({ item, target, speaker, sceneId }) {
    this.pendingAttackContext = {
      itemName: item.name,
      attackRange: AttackResultCapture.#getAttackRange(item),
      attackerActorId: speaker.actor,
      attackerTokenId: speaker.token ?? null,
      sceneId,
      targets: (target.targets ?? []).map((token, index) => ({
        actorId: token.actor?.id ?? null,
        tokenId: token.id,
        sceneId: token.document?.parent?.id ?? token.scene?.id ?? sceneId,
        defense: target.targDefValArray?.[index] ?? null,
        defenseType: target.targDefArray?.[index] ?? null,
        missed: target.targetMissed?.some(missedToken => missedToken.id === token.id) ?? false,
      })),
    };
  }

  /**
   * Returns the completed attack result when a chat message belongs to it.
   * A non-matching message leaves the pending capture intact.
   *
   * @param {ChatMessage} message
   * @returns {object|null}
   */
  consume(message) {
    const attack = this.pendingAttackContext;
    if (!attack || !message.flavor?.includes(attack.itemName) || !message.rolls?.[0]) {
      return null;
    }
    this.pendingAttackContext = null;
    const roll = message.rolls[0];
    return { ...attack, total: roll.total, natural: AttackResultCapture.#getNaturalD20Result(roll) };
  }

  /** Discards an intercepted attack before any later roll can consume it. */
  discard() {
    this.pendingAttackContext = null;
  }

  /**
   * Extracts the first active d20 face from a Foundry roll.
   *
   * @param {Roll} roll
   * @returns {number|null}
   */
  static #getNaturalD20Result(roll) {
    const die = roll.dice?.find(candidate => candidate.faces === 20);
    return die?.results?.find(result => result.active !== false)?.result ?? null;
  }

  /**
   * Reads the legacy DnD4e attack-range field from either supported item shape.
   *
   * @param {Item} item
   * @returns {string|null}
   */
  static #getAttackRange(item) {
    const system = item.system ?? item.data?.data ?? {};
    const attack = system.attack ?? {};
    const range = item.rangeType ?? system.rangeType ?? attack.range;
    return typeof range === "string" ? range : typeof range?.value === "string" ? range.value : null;
  }
}
