import { MODULE_ID, FLAG, automationConfig } from "./rules.js";

let systemPromise;

/** Load only the pinned system's existing helpers; no duplicate attack arithmetic. */
export function loadSystem() {
	systemPromise ??= import("../../../../systems/dnd4e/module/utils/utils.mjs");
	return systemPromise;
}

/** Resolve the weapon and range using DnD4e 0.9.3's roll data/resolver. */
export async function resolveRange(item) {
	const utils = await loadSystem();
	if (["closeBurst", "closeBlast", "rangeBurst", "rangeBlast"].includes(item.system.rangeType)) {
		const shape = item.system.rangeType;
		const area = Number(utils.evaluateFormula(item.system.area, item.actor, { strict: true, contextName: "power area" }));
		const distance = shape.startsWith("close") ? area
			: Number(utils.evaluateFormula(item.system.rangePower, item.actor, { strict: true, contextName: "area placement range" }));
		if (![area, distance].every(value => Number.isInteger(value) && value > 0)) {
			throw new Error("Area targeting needs positive, whole-square area and range formulas.");
		}
		return { shape, area, normal: distance, maximum: distance, mode: "area", weaponId: null };
	}
	const data = item.getRollData().item;
	const weapon = utils.getWeaponUse(data, item.actor);
	let normal;
	let maximum;
	let mode = item.system.rangeType === "range" ? "ranged" : "melee";
	if (item.system.rangeType === "weapon") {
		if (!weapon) {
			throw new Error("Choose an equipped weapon for this power before using target automation.");
		}
		const thrown = weapon.system.properties.thv || weapon.system.properties.tlg;
		const ranged = item.system.weaponType !== "melee" && (item.system.weaponType === "ranged" || weapon.system.isRanged || thrown);
		mode = ranged ? "ranged" : "melee";
		const meleeRange = item.system.rangePower
			? Number(utils.evaluateFormula(item.system.rangePower, item.actor, { strict: true, contextName: "weapon reach" }))
			: (weapon.system.properties.rch ? 2 : 1);
		normal = ranged ? Number(weapon.system.range.value) : meleeRange;
		maximum = ranged ? Math.max(normal, Number(weapon.system.range.long) || normal) : normal;
	} else {
		normal = Number(utils.evaluateFormula(item.system.rangePower, item.actor, { strict: true, contextName: "power targeting range" }));
		maximum = item.system.rangeType === "range" && item.system.range?.long
			? Math.max(normal, Number(utils.evaluateFormula(item.system.range.long, item.actor, { strict: true, contextName: "long range" }))) : normal;
	}
	if (!Number.isFinite(normal) || normal <= 0 || !Number.isInteger(normal) || !Number.isFinite(maximum) || !Number.isInteger(maximum)) {
		throw new Error("This power needs a positive, whole-square range for target automation.");
	}
	return { normal, maximum, mode, weaponId: weapon?.id ?? null };
}

/** Extend the native power sheet's real ApplicationV2 tabs and render parts. */
export async function registerAutomationTab() {
	Hooks.on("preUpdateItem", disableAutomatedPowerMacros);
	const { default: Sheet } = await import("../../../../systems/dnd4e/module/applications/sheets/item-sheet.mjs");
	if (Sheet.PARTS.automation) {
		return;
	}
	Sheet.PARTS.automation = { template: `modules/${MODULE_ID}/scripts/power-activation/automation.hbs`, scrollable: [""] };
	Sheet.TABS.sheet.tabs.push({ id: "automation", label: "Automation", condition: item => item.type === "power" });
	const prepare = Sheet.prototype._preparePartContext;
	Sheet.prototype._preparePartContext = async function (partId, context, ...args) {
		const result = await prepare.call(this, partId, context, ...args);
		if (partId === "automation") {
			result.automation = automationConfig(this.document);
			result.automationTargetModes = { area: "All in area", exact: "Exact amount" };
			result.automationDispositions = { all: "All creatures", enemies: "Enemies", allies: "Allies" };
			result.editable = this.isEditable;
		}
		return result;
	};
}

/**
 * Apply card-use costs only at actual attack submission, never on a preview.
 * The system handles attack ammunition itself after its dialog callback.
 */
export async function commitCardCosts(item) {
	if (!item.isOwner || !item.actor?.isOwner) {
		throw new Error("You no longer have permission to use this power.");
	}
	if (item.system.uses?.per && Number(item.system.uses.value) <= 0) {
		throw new Error("This power has no uses remaining.");
	}
	if (await item._handleResourceConsumption({ isCard: true, isAttack: false }, item.system) === false) {
		return false;
	}
	return true;
}

/** Finalize the limited use once a roll really exists, retaining system turn/round policy. */
export async function commitPowerUse(item) {
	const uses = item.system.uses;
	if (uses?.per && (game.combat || !["round", "turn"].includes(uses.per))) {
		await item.update({ "system.uses.value": Math.max(Number(uses.value || 0) - 1, 0) });
	}
}

/** Keep use macros disabled in the same document update that enables automation. */
export function disableAutomatedPowerMacros(item, changes) {
	if (item.type !== "power") {
		return;
	}
	const expanded = foundry.utils.expandObject(changes);
	const enabled = expanded.flags?.[MODULE_ID]?.[FLAG]?.enabled ?? automationConfig(item).enabled;
	if (!enabled) {
		return;
	}
	const macros = expanded.system?.macros ?? item.system.macros;
	if (Array.isArray(macros) && macros.some(macro => macro.enabled)) {
		const disabled = macros.map(macro => ({ ...macro, enabled: false }));
		if (changes.system) {
			changes.system.macros = disabled;
		} else {
			changes["system.macros"] = disabled;
		}
	}
}
