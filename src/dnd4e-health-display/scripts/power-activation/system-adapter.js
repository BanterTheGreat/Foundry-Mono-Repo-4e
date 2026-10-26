import { MODULE_ID, FLAG, automationConfig } from "./rules.js";
import { AREA_TYPES } from "./area-geometry.js";

let systemPromise;

/**
 * Show only settings used by this power's current targeting workflow.
 * Hidden values stay on the item so changing workflows does not reset them.
 */
export function automationSheetState(item) {
	const config = automationConfig(item);
	const summon = config.placementMode === "summon";
	const area = !summon && AREA_TYPES.includes(item.system.rangeType);
	return {
		summon,
		area,
		showTargetCount: !summon && (!area || config.targetMode === "exact"),
		wall: !summon && item.system.rangeType === "wall",
		canSummon: !item.hasAttack,
		invalidSummon: summon && item.hasAttack,
	};
}

/** Load only the pinned system's existing helpers; no duplicate attack arithmetic. */
export function loadSystem() {
	systemPromise ??= import("../../../../systems/dnd4e/module/utils/utils.mjs");
	return systemPromise;
}

/** Resolve the weapon and range using DnD4e 0.9.3's roll data/resolver. */
export async function resolveRange(item) {
	const utils = await loadSystem();
	if (automationConfig(item).placementMode === "summon") {
		const distance = Number(utils.evaluateFormula(item.system.rangePower, item.actor, { strict: true, contextName: "summon range" }));
		if (!Number.isInteger(distance) || distance < 0) {
			throw new Error("Summoning requires a nonnegative whole-square Range.");
		}
		return { shape: "summon", area: 1, normal: distance, maximum: distance, mode: "area" };
	}
	if (AREA_TYPES.includes(item.system.rangeType)) {
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
	if (item.system.rangeType === "touch") {
		// Touch is adjacent, regardless of weapon reach or the power's range formula.
		normal = 1;
		maximum = 1;
	} else if (item.system.rangeType === "weapon") {
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
			result.automationView = automationSheetState(this.document);
			result.automationPlacementModes = { targets: "Select targets / area" };
			if (result.automationView.canSummon || result.automationView.summon) {
				result.automationPlacementModes.summon = result.automationView.invalidSummon
					? "Summon (requires a non-attack power)" : "Place summoned creature";
			}
			result.automationTargetModes = { area: "All in area", exact: "Exact amount" };
			result.automationDispositions = { all: "All creatures", enemies: "Enemies", allies: "Allies" };
			result.editable = this.isEditable;
			const actorLabel = async uuid => ({ uuid, name: (await fromUuid(uuid))?.name ?? "Missing actor" });
			result.summonActor = result.automation.summonActor ? await actorLabel(result.automation.summonActor) : null;
			result.originActors = await Promise.all(result.automation.originActors.map(actorLabel));
		}
		return result;
	};
	const drop = Sheet.prototype._onDrop;
	Sheet.prototype._onDrop = async function (event) {
		const zone = event.target.closest("[data-automation-actor]");
		if (!zone || this.document.type !== "power") {
			return drop.call(this, event);
		}
		event.preventDefault();
		if (!this.isEditable) {
			return;
		}
		try {
			const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
			if (data.type !== "Actor") {
				throw new Error("Drop an actor from the Actors directory or a compendium.");
			}
			const actor = await Actor.implementation.fromDropData(data);
			if (!actor) {
				throw new Error("The dropped actor is unavailable.");
			}
			const config = automationConfig(this.document);
			const key = zone.dataset.automationActor;
			await this.document.setFlag(MODULE_ID, `${FLAG}.${key}`, key === "originActors"
				? [...new Set([...config.originActors, actor.uuid])] : actor.uuid);
			await this.render({ force: true });
		} catch (error) {
			ui.notifications.error(error.message);
		}
	};
	const render = Sheet.prototype._onRender;
	Sheet.prototype._onRender = async function (...args) {
		await render.apply(this, args);
		this.element.querySelectorAll("[data-automation-remove]").forEach(button => button.addEventListener("click", async event => {
			event.preventDefault();
			if (!this.isEditable) {
				return;
			}
			const key = button.dataset.automationRemove;
			const config = automationConfig(this.document);
			await this.document.setFlag(MODULE_ID, `${FLAG}.${key}`, key === "originActors"
				? config.originActors.filter(uuid => uuid !== button.dataset.uuid) : "");
			await this.render({ force: true });
		}));
	};
}

/**
 * Supply a token only to this native roll, without mutating either document.
 * DnD4e 0.9.3 tokenForActor reads actor.token before getActiveTokens.
 * Bind document methods to their real receiver to preserve private fields and updates.
 */
export function rollFromOrigin(item, source, options) {
	const actor = new Proxy(item.actor, {
		get(target, key) {
			if (key === "token") {
				return source.document;
			}
			const value = Reflect.get(target, key, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	const power = new Proxy(item, {
		get(target, key) {
			if (key === "actor") {
				return actor;
			}
			const value = Reflect.get(target, key, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return item.rollAttack.call(power, options);
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
