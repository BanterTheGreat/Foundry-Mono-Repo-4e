export const MODULE_ID = "dnd4e-health-display";

import {
	registerActorDisplay,
	registerActorDisplaySettings,
} from "./scripts/actor-display/actor-display.js";
import {
	registerHealthDisplay,
	registerHealthDisplaySettings,
} from "./scripts/health-display/health-display.js";
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

Hooks.once("init", () => {
	registerPowerActivationSettings();
	registerNegotiationSettings();
	registerHealthDisplaySettings();
	registerActorDisplaySettings();
	registerMarkDisplaySettings();
	registerCombatStartSettings();
});

Hooks.once("ready", () => {
	void registerPowerActivation();
	registerNegotiation();
	registerHealthDisplay();
	registerActorDisplay();
	registerMarkDisplay();
	registerCombatStart();
});
