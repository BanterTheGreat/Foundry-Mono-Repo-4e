/** Longest an unmatched capture is kept before being forgotten. */
const CAPTURE_LIFETIME_MS = 60_000;

/**
 * Holds DnD4e attacks between the `dnd4e.rollAttack` hook and the chat message
 * that supplies the roll total.
 *
 * Several attacks can be in flight at once (multi-attacks, two clients rolling
 * together), so captures are queued and each chat message claims the one that
 * matches its power name and speaker. Every capture carries an `attackId` that
 * follows the attack into its events. Player Defense may discard a capture when
 * it replaces the system message with its own resolved outcome.
 */
export class AttackResultCapture {
  #pending = [];
  #sequence = 0;

  /**
   * Records the portion of the DnD4e attack hook needed to resolve each target.
   *
   * @param {{item: Item, target: object, speaker: object, sceneId: string|null}} attack
   * @returns {void}
   */
  capture({ item, target, speaker, sceneId }) {
    this.#sequence += 1;
    this.#pruneExpired();
    this.#pending.push({
      attackId: `attack-${Date.now().toString(36)}-${this.#sequence}`,
      createdAt: Date.now(),
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
    });
  }

  /**
   * Returns the completed attack result when a chat message belongs to one.
   * A non-matching message leaves every pending capture intact.
   *
   * @param {ChatMessage} message
   * @returns {object|null}
   *   The capture with its roll `total` and `natural` d20 result, or null.
   */
  consume(message) {
    if (!message.rolls?.[0]) {
      return null;
    }
    const index = this.#pending.findIndex(attack => AttackResultCapture.#matchesMessage(attack, message));
    if (index === -1) {
      return null;
    }
    const [attack] = this.#pending.splice(index, 1);
    const roll = message.rolls[0];
    const { createdAt, ...completed } = attack;
    return { ...completed, total: roll.total, natural: AttackResultCapture.#getNaturalD20Result(roll) };
  }

  /**
   * Discards a capture that Player Defense has replaced before creation.
   *
   * @param {ChatMessage} [message]
   *   The message being replaced. Without it, the most recent capture goes.
   */
  discard(message) {
    const index = message
      ? this.#pending.findIndex(attack => AttackResultCapture.#matchesMessage(attack, message))
      : this.#pending.length - 1;
    if (index >= 0) {
      this.#pending.splice(index, 1);
    }
  }

  /** Forgets captures whose chat message never arrived. */
  #pruneExpired() {
    const oldest = Date.now() - CAPTURE_LIFETIME_MS;
    this.#pending = this.#pending.filter(attack => attack.createdAt >= oldest);
  }

  /**
   * Checks that a chat message is the one an attack is waiting for: its flavor
   * names the power and, when both sides know the speaker, it is the same one.
   *
   * @param {object} attack
   * @param {ChatMessage} message
   * @returns {boolean}
   */
  static #matchesMessage(attack, message) {
    if (!message.flavor?.includes(attack.itemName)) {
      return false;
    }
    const speaker = message.speaker ?? {};
    if (speaker.token && attack.attackerTokenId) {
      return speaker.token === attack.attackerTokenId;
    }
    if (speaker.actor && attack.attackerActorId) {
      return speaker.actor === attack.attackerActorId;
    }
    return true;
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
