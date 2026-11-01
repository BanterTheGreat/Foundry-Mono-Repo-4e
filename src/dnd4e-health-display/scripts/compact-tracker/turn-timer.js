/** Turn timer state and pause bookkeeping. Pure, so it can be tested without Foundry. */

/** A dice animation that never reports completion must not freeze the timer forever. */
const STALE_DICE_MS = 20000;

/** Counts up while a turn is running; restarts when the turn changes; freezes while paused. */
export class TurnTimer {
	key = null;
	elapsedMs = 0;
	#last = null;

	/**
	 * Advance the timer to `now`.
	 *
	 * @param {string|null} key Identifies the current turn; a different key restarts at zero.
	 * @param {string|null} pausedBy The reason the timer is frozen, if any.
	 * @param {number} now Current time in milliseconds.
	 * @returns {{elapsedMs: number, pausedBy: string|null}}
	 */
	update(key, pausedBy, now) {
		if (key !== this.key) {
			this.key = key;
			this.elapsedMs = 0;
		} else if (key !== null && !pausedBy && this.#last !== null) {
			this.elapsedMs += Math.max(0, now - this.#last);
		}
		this.#last = now;
		return { elapsedMs: this.elapsedMs, pausedBy: key === null ? null : pausedBy };
	}
}

/**
 * Tracks what is currently holding the timer: Target Automation sessions reported by any user, and Dice So
 * Nice animations seen by this client. Target Automation takes precedence when both apply.
 */
export class PauseRegistry {
	#targeting = new Map();
	#dice = new Map();

	/** Record that a user's Target Automation session is open (or has closed). */
	setTargeting(userId, active, tokenUuid = null) {
		if (active) {
			this.#targeting.set(userId, tokenUuid);
		} else {
			this.#targeting.delete(userId);
		}
	}

	/** Forget everything a user reported, for example when they disconnect. */
	clearUser(userId) {
		this.#targeting.delete(userId);
	}

	/** Record that a Dice So Nice animation started (or finished) for a chat message. */
	setDice(messageId, active, now) {
		if (active) {
			this.#dice.set(messageId, now);
		} else {
			this.#dice.delete(messageId);
		}
	}

	/**
	 * Why the timer is frozen right now, or null when it is running.
	 *
	 * @param {string|null} actingTokenUuid The acting combatant's token. A session only counts when it belongs to
	 *   that token, so a reaction from someone else does not freeze another player's turn.
	 * @param {number} now Current time in milliseconds.
	 * @returns {"Target Automation"|"Dice So Nice"|null}
	 */
	reason(actingTokenUuid, now) {
		for (const tokenUuid of this.#targeting.values()) {
			if (tokenUuid === null || tokenUuid === actingTokenUuid) {
				return "Target Automation";
			}
		}
		for (const [messageId, startedAt] of this.#dice) {
			if (now - startedAt > STALE_DICE_MS) {
				this.#dice.delete(messageId);
			}
		}
		return this.#dice.size ? "Dice So Nice" : null;
	}
}
