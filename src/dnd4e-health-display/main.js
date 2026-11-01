export const MODULE_ID = "dnd4e-health-display";

import {
	registerActorDisplay,
	registerActorDisplaySettings,
} from "./scripts/actor-display/actor-display.js";
import { registerHealthDisplay } from "./scripts/health-display/health-display.js";
import {
	registerMarkDisplay,
	registerMarkDisplaySettings,
} from "./scripts/mark-display/mark-display.js";
import {
	registerCombatStart,
	registerCombatStartSettings,
} from "./scripts/combat-start/combat-start.js";

import { registerNegotiation, registerNegotiationSettings } from "./scripts/negotiation/negotiation.js";
import { registerPowerActivation, registerPowerActivationSettings } from "./scripts/power-activation/power-activation.js";

import { registerCombatLedger, registerLedgerSettings } from "./scripts/combat-ledger/combat-ledger.js";

import { registerBattleMomentum, registerMomentumSettings } from "./scripts/battle-momentum/battle-momentum.js";

import { registerCompactTracker, registerCompactTrackerSettings } from "./scripts/compact-tracker/compact-tracker.js";

Hooks.once("init", () => {
	registerMomentumSettings();
	registerCompactTrackerSettings();
	registerPowerActivationSettings();
	registerNegotiationSettings();
	registerActorDisplaySettings();
	registerMarkDisplaySettings();
	registerCombatStartSettings();
	registerLedgerSettings();
});

Hooks.once("ready", () => {
	registerCombatLedger();
	registerBattleMomentum();
	registerCompactTracker();
	void registerPowerActivation();
	registerNegotiation();
	registerHealthDisplay();
	registerActorDisplay();
	registerMarkDisplay();
	registerCombatStart();
});
