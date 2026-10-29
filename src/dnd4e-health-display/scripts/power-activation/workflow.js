/** Workflow states own both legal transitions and the panel's presentation mode. */
const STATES = {
	targeting: { screen: "targeting", next: ["attackDialog", "updatingVariant"] },
	updatingVariant: { screen: "targeting", busy: true, status: "Updating attack mode…", next: ["targeting"] },
	attackDialog: { screen: "targeting", busy: true, status: "Attack dialog open", next: ["targeting", "rollingAttack", "preparingResults", "rollingHealing"] },
	rollingAttack: { screen: "targeting", busy: true, status: "Rolling attack dice…", next: ["preparingResults"] },
	preparingResults: { screen: "results", reviewing: true, busy: true, status: "Preparing attack results…", next: ["reviewingResults", "awaitingDefenses"] },
	awaitingDefenses: { screen: "results", reviewing: true, status: "Awaiting player defenses", next: ["reviewingResults", "updatingResults"] },
	reviewingResults: { screen: "results", reviewing: true, status: "Confirm attack", next: ["updatingResults", "confirmingResults"] },
	updatingResults: { screen: "results", reviewing: true, busy: true, status: "Updating attack results…", next: ["reviewingResults", "awaitingDefenses"] },
	confirmingResults: { screen: "results", reviewing: true, busy: true, status: "Confirming attack results…", next: ["reviewingResults", "readyForDamage"] },
	readyForDamage: { screen: "results", damage: true, status: "Attack resolved", next: ["rollingDamage", "retryingDamage", "updatingDamage", "confirmingDamage"] },
	rollingDamage: { screen: "results", reviewing: true, busy: true, status: "Rolling damage…", next: ["readyForDamage", "reviewingDamage"] },
	retryingDamage: { screen: "results", damage: true, busy: true, status: "Rolling damage…", next: ["readyForDamage", "reviewingDamage"] },
	reviewingDamage: { screen: "results", status: "Confirm damage", next: ["updatingDamage", "confirmingDamage", "rollingDamage", "retryingDamage"] },
	updatingDamage: { screen: "results", busy: true, status: "Updating damage…", next: ["reviewingDamage"] },
	confirmingDamage: { screen: "results", busy: true, status: "Confirming damage…", next: ["reviewingDamage", "complete"] },
	rollingHealing: { screen: "healing", busy: true, status: "Rolling healing…", next: ["reviewingHealing", "readyForHealing"] },
	readyForHealing: { screen: "healing", status: "Healing roll pending", next: ["rollingHealing"] },
	reviewingHealing: { screen: "healing", status: "Confirm healing", next: ["updatingHealing", "confirmingHealing"] },
	updatingHealing: { screen: "healing", busy: true, status: "Updating healing…", next: ["reviewingHealing"] },
	confirmingHealing: { screen: "healing", busy: true, status: "Confirming healing…", next: ["reviewingHealing", "complete"] },
	complete: { screen: "results", status: "Damage confirmed", next: [] },
	closed: { screen: "closed", next: [] },
};

/** Explicit activation lifecycle; closing is terminal even when asynchronous work finishes later. */
export class ActivationWorkflow {
	#state = "targeting";

	/** Current workflow state, changed only through transition(). */
	get state() {
		return this.#state;
	}

	/** Derive presentation from the workflow without storing duplicate flags. */
	get view() {
		const { screen, busy = false, reviewing = false, damage = false, status = "" } = STATES[this.state];
		return { screen, busy, reviewing, damage, status };
	}

	/** Whether an operation currently owns the session. */
	get busy() {
		return this.view.busy;
	}

	/** Closed sessions cannot be reopened by late callbacks. */
	get finished() {
		return this.state === "closed";
	}

	/** Enforce legal transitions; ignore late transitions after disposal. */
	transition(next) {
		if (this.finished || next === this.state) {
			return;
		}
		if (next !== "closed" && !STATES[this.state].next.includes(next)) {
			throw new Error(`Invalid activation transition: ${this.state} → ${next}`);
		}
		this.#state = next;
	}
}
