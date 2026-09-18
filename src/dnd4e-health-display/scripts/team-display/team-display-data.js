/**
 * Build template data for the independent party team display.
 *
 * @param {Token[]} tokens The scene tokens selected for the display.
 * @returns {{members: Array<object>}}
 */
export function getTeamDisplayData(tokens) {
	return {
		members: tokens.filter((token) => token.actor).map((token) => getTeamMemberData(token)),
	};
}

/** @param {Token} token The token representing one party member. */
function getTeamMemberData(token) {
	const actor = token.actor;
	const hp = actor.system?.attributes?.hp ?? {};
	const surges = actor.system?.details?.surges ?? {};
	const hpValue = Number(hp.value) || 0;
	const hpMaximum = Math.max(Number(hp.max) || 0, 1);
	const surgeValue = Math.max(Number(surges.value) || 0, 0);
	const surgeMaximum = Math.max(Number(surges.max) || 0, 1);
	const hpPercent = getResourcePercent(hpValue, hpMaximum);
	const hpSegmentCount = 6;
	const filledHpSegments = getFilledSegmentCount(hpValue, hpMaximum, hpSegmentCount);

	return {
		actorId: actor.id,
		tokenId: token.id,
		name: actor.name,
		portrait: token.document?.texture?.src || actor.img,
		actorImage: actor.img || token.document?.texture?.src,
		isCritical: hpPercent <= 25,
		hp: {
			value: hpValue,
			maximum: hpMaximum,
			angle: filledHpSegments * (360 / hpSegmentCount),
			segmentAngle: 360 / hpSegmentCount,
		},
		surges: {
			value: surgeValue,
			maximum: surgeMaximum,
			angle: getResourcePercent(surgeValue, surgeMaximum) * 3.6,
		},
	};
}

/** @param {number} value The current resource. @param {number} maximum The resource maximum. */
function getResourcePercent(value, maximum) {
	return Math.min(100, Math.max(0, (value / maximum) * 100));
}

/** @param {number} value The current resource. @param {number} maximum The resource maximum. @param {number} count The segment count. */
function getFilledSegmentCount(value, maximum, count) {
	if (maximum <= 0 || count <= 0) {
		return 0;
	}

	return Math.min(count, Math.ceil((Math.max(value, 0) / maximum) * count));
}
