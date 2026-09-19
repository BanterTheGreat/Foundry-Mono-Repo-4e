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
	registerTeamDisplay,
	registerTeamDisplaySettings,
} from "./scripts/team-display/team-display.js";
import {
	registerMarkDisplay,
	registerMarkDisplaySettings,
} from "./scripts/mark-display/mark-display.js";
import {
	registerCombatStart,
	registerCombatStartSettings,
} from "./scripts/combat-start/combat-start.js";
import {
	registerCombatTracker,
	registerCombatTrackerSettings,
} from "./scripts/combat-tracker/combat-tracker.js";

Hooks.once("init", () => {
	registerHealthDisplaySettings();
	registerActorDisplaySettings();
	registerTeamDisplaySettings();
	registerMarkDisplaySettings();
	registerCombatStartSettings();
	registerCombatTrackerSettings();
});

Hooks.once("ready", () => {
	registerHealthDisplay();
	registerActorDisplay();
	registerTeamDisplay();
	registerMarkDisplay();
	registerCombatStart();
	registerCombatTracker();
});
