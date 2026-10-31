/**
 * Pure helpers for several creatures of one type using a power together.
 *
 * Each attacker uses the power once and attacks up to `perAttacker` distinct creatures. A target can be
 * attacked by several attackers, so `demands` records how many attackers are assigned to each target.
 */

/** Range types whose targets are chosen one creature at a time from the attacker's own position. */
export const MULTI_ATTACK_RANGE_TYPES = ["melee", "touch", "reach", "weapon", "range"];

/**
 * Whether several selected creatures can use this power together.
 * Every attacker needs its own copy of the power and its own actor document, which unlinked
 * tokens have and linked duplicates of one actor do not.
 *
 * @param {Item} item The power chosen from the first creature.
 * @param {Token[]} tokens The selected attackers.
 * @returns {boolean}
 */
export function supportsGroupAttack(item, tokens) {
	if (!item?.hasAttack || !MULTI_ATTACK_RANGE_TYPES.includes(item.system?.rangeType) || tokens.length < 2) {
		return false;
	}

	const uuids = new Set(tokens.map((token) => token.actor?.uuid));
	return !uuids.has(undefined) && uuids.size === tokens.length
		&& tokens.every((token) => token.actor.items?.get(item.id)?.type === item.type);
}

/**
 * Resolve how many attackers each target receives. Explicit values stay as entered; unset targets
 * share the remaining attack slots as evenly as the attacker count allows, never below one.
 *
 * @param {string[]} targetIds Selected target ids in display order.
 * @param {Map<string, number>} explicit Counts the user typed in.
 * @param {number} slots Total attacks available (attackers × targets per attacker).
 * @param {number} attackerCount Maximum attackers on one target.
 * @returns {Map<string, number>}
 */
export function resolveDemands(targetIds, explicit, slots, attackerCount) {
	const demands = new Map();
	let remaining = slots;
	const unset = [];
	for (const id of targetIds) {
		const value = Math.floor(Number(explicit.get(id)));
		if (Number.isFinite(value) && value >= 0) {
			demands.set(id, Math.min(value, attackerCount));
			remaining -= demands.get(id);
		} else {
			unset.push(id);
		}
	}

	unset.forEach((id, index) => {
		const share = Math.floor(remaining / (unset.length - index));
		const value = Math.max(1, Math.min(share, attackerCount));
		demands.set(id, value);
		remaining -= value;
	});
	return new Map(targetIds.map((id) => [id, demands.get(id)]));
}

/**
 * Describe count problems for a group selection.
 *
 * @param {Map<string, number>} demands Attackers per target.
 * @param {number} slots Total attacks available.
 * @param {"exact"|"upTo"} mode Whether every attack slot must be used.
 * @returns {string[]}
 */
export function groupCountProblems(demands, slots, mode = "exact") {
	const total = [...demands.values()].reduce((sum, value) => sum + value, 0);
	if (mode === "upTo") {
		return total < 1 || total > slots ? [`Assigned ${total} attacks; this group can make 1 to ${slots}.`] : [];
	}

	return total !== slots ? [`Assigned ${total} attacks; this group makes exactly ${slots}.`] : [];
}

/**
 * Randomly assign attackers to targets so every demand is met where range allows.
 * This is a bipartite flow problem: attackers supply up to `perAttacker` distinct targets, targets
 * demand a fixed number of attackers, and an edge exists only when the attacker can reach the target.
 *
 * @param {object} config Assignment inputs.
 * @param {string[]} config.attackers Attacker ids.
 * @param {Map<string, number>} config.demands Attackers wanted on each target id.
 * @param {number} config.perAttacker Distinct targets each attacker may attack.
 * @param {(attackerId: string, targetId: string) => boolean} config.canReach Range and elevation check.
 * @param {() => number} [config.random] Random source in [0, 1).
 * @returns {{ok: boolean, assignments: Map<string, string[]>, shortfalls: Map<string, number>}}
 */
export function assignAttackers({ attackers, demands, perAttacker, canReach, random = Math.random }) {
	const shuffle = (list) => {
		const copy = [...list];
		for (let index = copy.length - 1; index > 0; index--) {
			const swap = Math.floor(random() * (index + 1));
			[copy[index], copy[swap]] = [copy[swap], copy[index]];
		}
		return copy;
	};
	const targetIds = [...demands.keys()].filter((id) => demands.get(id) > 0);
	const edges = new Map(attackers.map((attacker) => [attacker, shuffle(targetIds.filter((id) => canReach(attacker, id)))]));
	const assigned = new Map(attackers.map((attacker) => [attacker, new Set()]));
	const received = new Map(targetIds.map((id) => [id, new Set()]));

	/**
	 * Try to give one target another attacker, moving earlier assignments aside when needed.
	 *
	 * @param {string} targetId Target needing an attacker.
	 * @param {Set<string>} visited Attackers already tried in this search.
	 * @returns {boolean}
	 */
	const augment = (targetId, visited) => {
		for (const attacker of shuffle(attackers)) {
			if (visited.has(attacker) || received.get(targetId).has(attacker) || !edges.get(attacker).includes(targetId)) {
				continue;
			}
			visited.add(attacker);
			if (assigned.get(attacker).size < perAttacker) {
				assigned.get(attacker).add(targetId);
				received.get(targetId).add(attacker);
				return true;
			}

			// The attacker is full: swap one of its other targets onto someone else.
			for (const other of shuffle([...assigned.get(attacker)])) {
				if (!received.get(other)) {
					continue;
				}
				assigned.get(attacker).delete(other);
				received.get(other).delete(attacker);
				if (augment(other, visited)) {
					assigned.get(attacker).add(targetId);
					received.get(targetId).add(attacker);
					return true;
				}

				assigned.get(attacker).add(other);
				received.get(other).add(attacker);
			}
		}

		return false;
	};

	const shortfalls = new Map();
	for (const targetId of shuffle(targetIds)) {
		for (let count = received.get(targetId).size; count < demands.get(targetId); count++) {
			if (!augment(targetId, new Set())) {
				shortfalls.set(targetId, demands.get(targetId) - received.get(targetId).size);
				break;
			}
		}
	}

	return {
		ok: shortfalls.size === 0,
		assignments: new Map(attackers.map((attacker) => [attacker, [...assigned.get(attacker)]])),
		shortfalls,
	};
}

/**
 * Record every form control's value so later edits can be detected.
 *
 * @param {{elements: Iterable<{name?: string, type?: string, value?: string, checked?: boolean}>}} form A form-like object.
 * @returns {Map<string, {value: string, checked: boolean|undefined}>}
 */
export function snapshotFormFields(form) {
	const fields = new Map();
	for (const element of Array.from(form?.elements ?? [])) {
		if (element.name && element.type !== "submit" && element.type !== "button") {
			fields.set(element.name, { value: element.value, checked: element.type === "checkbox" ? Boolean(element.checked) : undefined });
		}
	}

	return fields;
}

/**
 * List the controls a user changed between two snapshots of the same dialog.
 *
 * @param {Map<string, {value: string, checked: boolean|undefined}>} before Snapshot when the dialog opened.
 * @param {Map<string, {value: string, checked: boolean|undefined}>} after Snapshot when it was submitted.
 * @returns {Array<{name: string, value: string, checked: boolean|undefined}>}
 */
export function diffFormFields(before, after) {
	const changes = [];
	for (const [name, field] of after) {
		const original = before.get(name);
		if (!original || original.value !== field.value || original.checked !== field.checked) {
			changes.push({ name, ...field });
		}
	}

	return changes;
}

/**
 * Replay a user's manual dialog edits onto another attacker's dialog. Per-target tabs fall back to
 * the first tab, so a shared bonus applies when the later attacker has fewer targets.
 *
 * @param {{elements: Iterable<object>}} form The later attacker's dialog form.
 * @param {Array<{name: string, value: string, checked: boolean|undefined}>} changes Edits to replay.
 */
export function applyFormChanges(form, changes) {
	const elements = Array.from(form?.elements ?? []);
	for (const change of changes) {
		let element = elements.find((entry) => entry.name === change.name);
		element ??= elements.find((entry) => entry.name === change.name.replace(/^\d+\./, "0."));
		if (!element) {
			continue;
		}

		if (change.checked === undefined) {
			element.value = change.value;
		} else {
			element.checked = change.checked;
		}
	}
}
