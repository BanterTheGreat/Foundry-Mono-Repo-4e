import { generateInlinePowerDetails } from "./actor-display-tooltips.js";

const POWER_CATEGORY_RULES = [
	["Standard", ["standard"]],
	["Move", ["move"]],
	["Minor", ["minor"]],
	["Reaction", ["reaction", "interrupt"]],
	["Other", []],
];

const FEATURE_CATEGORY_RULES = [
	["Feats", "feat"],
	["Theme", "theme"],
	["Background", "background"],
	["Class", "class"],
	["Paragon Path", "path"],
	["Epic Destiny", "destiny"],
	["Traits", "trait"],
	["Ancestry", "race"],
	["Other", "other"],
];

/**
 * Build all template data for the controlled-token actor display.
 *
 * @param {Token} token The displayed canvas token.
 * @param {string} activeTab The currently selected inventory tab.
 * @param {Set<string>} expandedPowerIds Player-character powers with their rules details expanded.
 * @returns {Promise<object>}
 */
export async function getActorDisplayData(token, activeTab, expandedPowerIds = new Set()) {
	const actor = token.actor;
	const isNpc = actor.type === "NPC";
	const hp = actor.system?.attributes?.hp ?? {};
	const surges = actor.system?.details?.surges ?? {};
	const hpValue = Number(hp.value) || 0;
	const hpMaximum = Math.max(Number(hp.max) || 0, 1);
	const surgeValue = Math.max(Number(surges.value) || 0, 0);
	const surgeMaximum = Math.max(Number(surges.max) || 0, 0);
	const hpSegmentCount = actor.type === "Player Character" ? 6 : 4;
	const filledHpSegments = getFilledSegmentCount(hpValue, hpMaximum, hpSegmentCount);
	const tabs = getTabs(actor, activeTab);

	return {
		name: actor.name,
		portrait: token.document?.texture?.src || actor.img,
		levelAndClass: getLevelAndClass(actor),
		subtitle: getSubtitle(actor),
		hp: {
			value: hpValue,
			maximum: hpMaximum,
			percent: Math.max(0, Math.min(100, (hpValue / hpMaximum) * 100)),
			dialAngle: filledHpSegments * (360 / hpSegmentCount),
			dialSegmentAngle: actor.type === "Player Character" ? 60 : 90,
		},
		tempHp: Number(actor.system?.attributes?.temphp?.value) || 0,
		hasSurges: !isNpc,
		surges: {
			value: surgeValue,
			maximum: surgeMaximum,
			segments: getSegments(surgeValue, surgeMaximum, surgeMaximum),
		},
		stats: getStats(actor),
		tabs,
		activeTab,
		activeTabLabel: tabs.find((tab) => tab.key === activeTab)?.label ?? "",
		horizontalActions: getHorizontalActions(actor),
		hotbarSlots: Array.from({ length: 14 }),
		isPlayerCharacter: actor.type === "Player Character",
		isPowers: activeTab === "powers" || (isNpc && activeTab === "features"),
		isSkills: activeTab === "skills",
		isFeatures: !isNpc && activeTab === "features",
		isNpcFeatures: isNpc && activeTab === "features",
		isItems: activeTab === "items",
		powerCategories: await getPowerCategories(actor, expandedPowerIds),
		skills: getSkills(actor),
		featureCategories: getFeatureCategories(actor),
		traitCategories: getTraitCategories(actor),
		itemCategories: getItemCategories(actor),
		quickActions: getQuickActions(actor),
	};
}

/**
 * Format the actor's level and class or monster role.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {string}
 */
function getLevelAndClass(actor) {
	const details = actor.system?.details ?? {};
	const role = details.role?.primary;
	return [`Level ${details.level ?? "?"}`, actor.type === "Player Character" ? details.class : role]
		.filter(Boolean)
		.join(" ");
}

/**
 * Find the most useful optional character subtitle available in the system data.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {string}
 */
function getSubtitle(actor) {
	const details = actor.system?.details ?? {};
	return details.title
		|| details.paragonPath
		|| details.paragon
		|| details.epicDestiny
		|| details.epic
		|| details.race
		|| "";
}

/**
 * Convert a current and maximum value into display segments.
 *
 * @param {number} value Current resource value.
 * @param {number} maximum Maximum resource value.
 * @param {number} count Number of display segments.
 * @returns {Array<{filled: boolean}>}
 */
function getSegments(value, maximum, count) {
	if (count <= 0) {
		return [];
	}

	const filled = getFilledSegmentCount(value, maximum, count);
	return Array.from({ length: count }, (_unused, index) => ({ filled: index < filled }));
}

/**
 * Convert a resource value into the count of whole display segments it fills.
 *
 * @param {number} value Current resource value.
 * @param {number} maximum Resource maximum.
 * @param {number} count Number of display segments.
 * @returns {number}
 */
function getFilledSegmentCount(value, maximum, count) {
	if (maximum <= 0 || count <= 0) {
		return 0;
	}

	return Math.min(count, Math.ceil((Math.max(value, 0) / maximum) * count));
}

/**
 * Build defense and initiative readouts.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {Promise<Array<object>>}
 */
function getStats(actor) {
	return [
		{ label: "Armor Class", shortLabel: "AC", value: actor.system?.defences?.ac?.value, icon: "fa-solid fa-shield" },
		{ label: "Fortitude", shortLabel: "Fort", value: actor.system?.defences?.fort?.value, icon: "fa-solid fa-dumbbell" },
		{ label: "Reflex", shortLabel: "Ref", value: actor.system?.defences?.ref?.value, icon: "fa-solid fa-bolt" },
		{ label: "Will", shortLabel: "Will", value: actor.system?.defences?.wil?.value, icon: "fa-solid fa-brain" },
		{ label: "Initiative", shortLabel: "Init", value: Number(actor.system?.attributes?.init?.value) || 0, icon: "fa-solid fa-person-running", action: "quick", command: "initiative" },
		{ label: "Speed", shortLabel: "Speed", value: Number(actor.system?.movement?.walk?.value) || 0, icon: "fa-solid fa-shoe-prints" },
	];
}

/**
 * Build the tabs available for this actor type.
 *
 * @param {Actor} actor The displayed actor.
 * @param {string} activeTab Active tab identifier.
 * @returns {Array<object>}
 */
function getTabs(actor, activeTab) {
	return [
		...(actor.type === "Player Character" ? [
			{ key: "powers", label: "Powers", icon: "fa-solid fa-sword", active: activeTab === "powers" },
		] : [
			{ key: "features", label: "Features", icon: "fa-solid fa-book", active: activeTab === "features" },
		]),
		{ key: "skills", label: "Skills", icon: "fa-solid fa-dice-d20", active: activeTab === "skills" },
		...(actor.type === "Player Character" ? [
			{ key: "features", label: "Feats", icon: "fa-solid fa-book", active: activeTab === "features" },
			{ key: "items", label: "Items", icon: "fa-solid fa-treasure-chest", active: activeTab === "items" },
		] : []),
	];
}

/**
 * Group and map powers for the display.
 *
 * @param {Actor} actor The displayed actor.
 * @param {Set<string>} expandedPowerIds Player-character powers with their rules details expanded.
 * @returns {Array<object>}
 */
async function getPowerCategories(actor, expandedPowerIds) {
	const powers = Array.from(actor.items ?? []).filter((item) => item.type === "power");
	const knownActions = POWER_CATEGORY_RULES.flatMap(([_name, actions]) => actions);

	const categories = POWER_CATEGORY_RULES.map(([name, actions]) => ({
		name,
		powers: powers
			.filter((power) => actions.length
				? actions.includes(power.system?.actionType)
				: !knownActions.includes(power.system?.actionType))
			.sort((left, right) => getPowerOrder(left) - getPowerOrder(right) || left.name.localeCompare(right.name))
			.map((power) => mapPower(power, actor, expandedPowerIds)),
	})).filter((category) => category.powers.length);

	return Promise.all(categories.map(async (category) => ({
		...category,
		powers: await Promise.all(category.powers),
	})));
}

/** @param {Item} power The power to map. @param {Actor} actor The power's actor. @param {Set<string>} expandedPowerIds Expanded player-character power ids. */
async function mapPower(power, actor, expandedPowerIds) {
	const uses = power.system?.uses ?? {};
	const maximum = Number(uses.max) || 0;
	const value = Number(uses.value) || 0;
	const isExpanded = expandedPowerIds.has(power.id);
	const inlineDetails = actor.type === "NPC" || isExpanded
		? await generateInlinePowerDetails(actor, power)
		: { html: "", cssClass: "" };
	return {
		id: power.id,
		name: power.name,
		icon: getPowerIcon(power),
		usageClass: `is-${power.system?.useType || "other"}`,
		showUses: maximum > 1,
		uses: `${value} / ${maximum}`,
		depleted: maximum > 0 && value <= 0,
		flavour: actor.type === "Player Character" ? getPowerFlavour(power) : "",
		isNpcPower: actor.type === "NPC",
		isExpandable: actor.type === "Player Character",
		isExpanded,
		canRollDamage: power.hasDamage,
		inlineDetails: inlineDetails.html,
		inlineDetailsClass: inlineDetails.cssClass,
	};
}

/**
 * Extract a power's short chat description for its compact PC list entry.
 *
 * @param {Item} power The power whose flavour text is needed.
 * @returns {string}
 */
function getPowerFlavour(power) {
	const html = power.system?.description?.chat ?? "";
	if (!html) {
		return "";
	}

	const element = document.createElement("div");
	element.innerHTML = html;
	return element.textContent?.trim() ?? "";
}

/** @param {Item} power The power to order. */
function getPowerOrder(power) {
	return { atwill: 0, encounter: 1, daily: 2, recharge: 3, item: 4, other: 5 }[power.system?.useType] ?? 6;
}

/** @param {Item} power The power whose range icon is needed. */
function getPowerIcon(power) {
	const rangeType = power.system?.rangeType;
	if (["melee", "touch", "reach"].includes(rangeType)) {
		return "fa-solid fa-sword";
	}

	if (rangeType === "range") {
		return "fa-solid fa-bow-arrow";
	}

	if (rangeType === "weapon") {
		return power.system?.weaponType === "ranged" ? "fa-solid fa-bow-arrow" : "fa-solid fa-sword";
	}

	return {
		closeBurst: "fa-solid fa-arrows-maximize",
		closeBlast: "fa-solid fa-square",
		rangeBurst: "fa-solid fa-burst",
		areaWall: "fa-solid fa-arrows-left-right",
		wall: "fa-solid fa-arrows-left-right",
		personal: "fa-solid fa-user",
	}[rangeType] ?? "fa-solid fa-star";
}

/** @param {Actor} actor The displayed actor. */
function getSkills(actor) {
	return Object.entries(actor.system?.skills ?? {})
		.map(([key, skill]) => ({ key, label: skill.label, modifier: formatModifier(skill.total) }))
		.sort((left, right) => left.label.localeCompare(right.label));
}

/** @param {Actor} actor The displayed actor. */
function getFeatureCategories(actor) {
	return FEATURE_CATEGORY_RULES.map(([name, type]) => ({
		name,
		features: Array.from(actor.items ?? [])
			.filter((item) => item.type === "feature" && item.system?.featureType === type)
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((item) => ({ id: item.id, name: item.name, description: getFeatureDescription(item) })),
	})).filter((category) => category.features.length);
}

/** @param {Item} feature The NPC trait or racial feat to describe. */
function getFeatureDescription(feature) {
	const html = feature.system?.description?.chat || feature.system?.description?.value || "";
	if (!html) {
		return "";
	}

	const element = document.createElement("div");
	element.innerHTML = html;
	return element.textContent?.trim() ?? "";
}

/**
 * Group NPC traits and racial feats, both represented by feature items.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {Array<object>}
 */
function getTraitCategories(actor) {
	const rules = [
		["Traits", "trait"],
		["Racial Feats", "race"],
	];

	return rules.map(([name, type]) => ({
		name,
		features: Array.from(actor.items ?? [])
			.filter((item) => item.type === "feature" && item.system?.featureType === type)
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((item) => ({ id: item.id, name: item.name, description: getFeatureDescription(item) })),
	})).filter((category) => category.features.length);
}

/** @param {Actor} actor The displayed actor. */
function getItemCategories(actor) {
	const rules = [
		["Weapons", (item) => item.type === "weapon", true],
		["Equipment", (item) => item.type === "equipment" && item.system?.armour?.type !== "other", true],
		["Wondrous Items", (item) => item.type === "equipment" && item.system?.armour?.type === "other", false],
		["Consumables", (item) => item.type === "consumable", false],
	];

	return rules.map(([name, predicate, canEquip]) => ({
		name,
		items: Array.from(actor.items ?? [])
			.filter(predicate)
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((item) => ({
				id: item.id,
				name: item.name,
				canEquip,
				equipped: Boolean(item.system?.equipped),
				weaponSummary: item.type === "weapon" ? getWeaponSummary(item) : "",
			})),
	})).filter((category) => category.items.length);
}

/**
 * Format a weapon's base damage dice and enabled properties.
 *
 * @param {Item} weapon The weapon item to summarize.
 * @returns {string}
 */
function getWeaponSummary(weapon) {
	const damage = Array.from(weapon.system?.damageDice?.parts ?? [])
		.map((part) => {
			const dice = `${part.numDice || 1}d${part.numFaces || "?"}`;
			const modifier = String(part.modifier ?? "").trim();
			if (!modifier) {
				return dice;
			}

			return `${dice}${modifier.startsWith("+") || modifier.startsWith("-") ? "" : "+"}${modifier}`;
		})
		.filter(Boolean)
		.join(" + ");
	const properties = Object.entries(weapon.system?.properties ?? {})
		.filter(([_key, enabled]) => enabled)
		.map(([key]) => {
			const label = CONFIG.DND4E.weaponProperties?.[key] ?? key;
			const localized = game.i18n.localize(label);
			return key === "bru" ? `${localized} ${weapon.system?.brutalNum ?? ""}`.trim() : localized;
		});

	return [damage, ...properties].filter(Boolean).join(" · ");
}

/** @param {Actor} actor The displayed actor. */
function getQuickActions(actor) {
	const save = Number(actor.system?.details?.saves?.value) || 0;
	return [
		{ key: "actionPoint", label: "Use AP", detail: actor.system?.actionpoints?.value ?? 0, icon: "fa-solid fa-bolt" },
		{ key: "savingThrow", label: "Saving Throw", detail: formatModifier(save), icon: "fa-solid fa-fire" },
		{ key: "healing", label: "Heal", icon: "fa-solid fa-plus" },
		{ key: "secondWind", label: "Second Wind", icon: "fa-solid fa-shield" },
		{ key: "shortRest", label: "Short Rest", icon: "fa-solid fa-bed" },
		{ key: "extendedRest", label: "Extended Rest", icon: "fa-solid fa-bed-pulse" },
		{ key: "deathSave", label: "Death Save", icon: "fa-solid fa-skull" },
		{ key: "openSheet", label: "Open Sheet", icon: "fa-solid fa-table-list" },
	];
}

/**
 * Build the action point / save / heal / rest button-and-dropdown data used by the horizontal actor display.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {object}
 */
function getHorizontalActions(actor) {
	const apValue = Number(actor.system?.actionpoints?.value) || 0;
	const save = Number(actor.system?.details?.saves?.value) || 0;
	const isDying = (Number(actor.system?.attributes?.hp?.value) || 0) <= 0;
	return {
		ap: { value: apValue, disabled: apValue <= 0 },
		save: [
			{ command: "savingThrow", label: "Saving Throw", detail: formatModifier(save) },
			{ command: "deathSave", label: "Death Save", disabled: !isDying },
		],
		heal: [
			{ command: "secondWind", label: "Second Wind" },
			{ command: "healing", label: "Heal" },
		],
		rest: [
			{ command: "shortRest", label: "Short Rest" },
			{ command: "extendedRest", label: "Extended Rest" },
		],
	};
}

/** @param {number|string} value Modifier value to format. */
function formatModifier(value) {
	const number = Number(value) || 0;
	return number >= 0 ? `+${number}` : String(number);
}
