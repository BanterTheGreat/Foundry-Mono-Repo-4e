/** Pure negotiation rules and deliberately limited public presentation data. */
export const ATTITUDES = {
	hostile: [1, 2], suspicious: [2, 2], neutral: [2, 3],
	open: [3, 3], friendly: [3, 4], trusting: [3, 5],
};
export const CONCERN_CATEGORIES = [
	'Benevolence', 'Discovery', 'Freedom', 'Greed', 'Higher Authority', 'Justice',
	'Legacy', 'Peace', 'Power', 'Protection', 'Revelry', 'Vengeance',
];

/** Resolve category-based concerns while retaining existing custom preset text. */
export function concernText(concern) {
	if (concern.category !== undefined) {
		return concern.override?.trim() || concern.category;
	}
	return concern.text ?? '';
}

export const OFFER_LABELS = ['No, and…', 'No', 'No, but…', 'Yes, but…', 'Yes', 'Yes, and…'];

export const OFFERS = [
	'No, and… No deal. The NPC acts against the party’s interests.',
	'No. Refusal without a counteroffer.',
	'No, but… Lesser help in exchange for what the party promised.',
	'Yes, but… The requested help, plus an additional condition.',
	'Yes. The requested deal, including what the party promised.',
	'Yes, and… Everything requested, plus an extra benefit.',
];

/** Create independent preparation defaults. */
export function defaultPreparation() {
	return {
		name: 'New negotiation', actorId: '', displayName: '', art: '', attitude: 'neutral',
		interest: 2, patience: 3, motivations: [], pitfalls: [],
		offers: [...OFFERS],
		visible: { interest: false, patience: false },
	};
}

/** Clamp a track to its legal integer range. */
export function track(value) {
	return Math.max(0, Math.min(5, Math.trunc(Number(value) || 0)));
}

/** Start fresh without mutating the reusable preparation. */
export function startSession(preparation, subject) {
	const session = structuredClone(preparation);
	session.subject = { name: preparation.displayName || subject.name, art: preparation.art || subject.img };
	session.interest = track(session.interest);
	session.patience = track(session.patience);
	if (!session.patience) {
		throw new Error('Starting Patience must be above 0.');
	}
	session.motivations = session.motivations.map(c => ({ ...c, used: false }));
	session.discoveryBlocked = false;
	session.ending = '';
	session.history = [];
	return session;
}

/** Interest takes priority over Patience when determining a final offer. */
export function sessionStatus(session) {
	if (session.interest === 0) {
		return 'No deal';
	}
	if (session.ending) {
		return session.ending;
	}
	if (session.interest === 5 || session.patience === 0) {
		return 'Final offer — accept or decline';
	}
	return 'Negotiating';
}

/** True only while another argument or discovery is legal. */
export function canContinue(session) {
	return !session.ending && session.interest > 0 && session.interest < 5 && session.patience > 0;
}

/**
 * Resolve a GM-selected result. Return a new state so previews and undo share exactly the same rules.
 * Automatic outcomes ignore natural rolls; detected lies never spend a motivation.
 * Track-only arguments apply the selected column without selecting or spending a concern.
 */
export function resolveAction(session, action) {
	const next = structuredClone(session);
	const before = structuredClone(session);
	delete before.history;
	let message = '';
	if (['argument', 'discovery'].includes(action.type)) {
		if (!canContinue(session)) {
			throw new Error('This offer is final. Correct the state or end the negotiation.');
		}
		let result = action.natural === '20' ? 'perfect' : action.natural === '1' ? 'catastrophic' : action.result;
		if (!['perfect', 'success', 'failure', 'catastrophic'].includes(result)) {
			throw new Error('Select a valid check outcome.');
		}
		if (action.type === 'discovery') {
			if (session.discoveryBlocked) {
				throw new Error('The party must make an argument before another discovery check.');
			}
			if (['perfect', 'success'].includes(result)) {
				const concerns = next[action.concernKind];
				const concern = ['motivations', 'pitfalls'].includes(action.concernKind) && concerns?.[action.concernIndex];
				if (!concern || concern.revealed) {
					throw new Error('Choose a hidden motivation or pitfall to reveal.');
				}
				concern.revealed = true;
			}
			next.patience -= result === 'perfect' ? 0 : 1;
			next.discoveryBlocked = true;
			message = `Discovery: ${result}`;
		} else {
			let kind = action.kind;
			if (!['ordinary', 'motivation', 'pitfall', 'repeated', 'decisive'].includes(kind)) {
				throw new Error('Select a valid argument type.');
			}
			const motivation = next.motivations[action.motivationIndex];
			if (!action.trackOnly && ['motivation', 'decisive'].includes(kind) && !motivation) {
				throw new Error('Choose the motivation invoked by this argument.');
			}
			if (!action.trackOnly && ['motivation', 'decisive'].includes(kind) && motivation.used) {
				kind = 'used';
			}
			const rolled = ['ordinary', 'motivation'].includes(kind);
			if (kind === 'pitfall' || kind === 'repeated') {
				next.interest -= 1;
				next.patience -= 1;
			} else if (kind === 'used') {
				next.patience -= 1;
			} else {
				if (kind === 'decisive') {
					result = 'perfect';
				}
				const motivating = kind !== 'ordinary';
				if (result === 'perfect' || (motivating && result === 'success')) {
					next.interest += 1;
				} else if (result === 'catastrophic' || (!motivating && result === 'failure')) {
					next.interest -= 1;
				}
				next.patience -= (motivating && result === 'perfect') || (rolled && action.natural === '20') ? 0 : 1;
				if (motivating && !action.trackOnly) {
					motivation.used = true;
				}
			}
			if (rolled && action.detectedLie) {
				if (next.interest > session.interest) {
					throw new Error('A lie can be detected only when the argument fails to increase Interest.');
				}
				next.interest -= 1;
				if (kind === 'motivation' && !action.trackOnly) {
					motivation.used = false;
				}
			}
			next.discoveryBlocked = false;
			message = `Argument: ${kind}${rolled || kind === 'decisive' ? ` / ${result}` : ''}`;
			if (rolled && action.detectedLie) {
				message += '. Detected lie; the exposed lie cannot earn another check';
			}
			if (!rolled) {
				result = kind === 'decisive' ? 'perfect' : '';
			}
		}
		if (result === 'catastrophic') {
			message += '. Add a fictional complication';
		}
		if (action.natural === '20' && result === 'perfect' && !(action.type === 'argument' && action.kind === 'decisive')) {
			message += '. Grant an additional useful benefit';
		}
	} else if (action.type === 'adjust') {
		next.interest = track(action.interest);
		next.patience = track(action.patience);
		next.ending = '';
		message = 'GM track correction';
	} else if (action.type === 'end') {
		if (!['Accepted', 'Declined', 'Walked away'].includes(action.ending) || session.interest === 0 || session.ending) {
			throw new Error('This negotiation has already ended.');
		}
		if (action.ending === 'Accepted' && session.interest < 2) {
			throw new Error('There is no deal to accept at Interest 0 or 1.');
		}
		next.ending = action.ending;
		message = action.ending;
	} else {
		throw new Error('Unknown negotiation action.');
	}
	next.interest = track(next.interest);
	next.patience = track(next.patience);
	next.history.push({ before, message: `${message}. Interest ${session.interest} → ${next.interest}; Patience ${session.patience} → ${next.patience}${action.note ? `. ${action.note}` : ''}` });
	return next;
}

/** Restore the last recorded mutation, including reveals and terms. */
export function undoSession(session) {
	const history = session.history.slice();
	const last = history.pop();
	return last ? { ...structuredClone(last.before), history } : session;
}

/** Explicit allowlist: never publish hidden concerns, clues, history, or preparation. */
export function publicSnapshot(session) {
	return {
		subject: { name: session.subject.name, art: session.subject.art },
		interest: session.visible.interest ? session.interest : null,
		patience: session.visible.patience ? session.patience : null,
		status: session.ending || (session.interest === 0 ? 'Negotiation ended' : session.interest === 5 || session.patience === 0 ? 'Final offer' : ''),
		motivations: session.motivations.filter(c => c.revealed).map(c => ({ text: concernText(c), ...(c.description ? { description: c.description } : {}), used: c.used })),
		pitfalls: session.pitfalls.filter(c => c.revealed).map(c => ({ text: concernText(c), ...(c.description ? { description: c.description } : {}) })),
	};
}
