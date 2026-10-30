/**
 * Resolve alternate rolls, restricting implicit basic-attack variants to Melee X or Weapon.
 * DnD4e 0.9.3 uses variance.isCharge and variance.isOpp for alternate rolls.
 * Basic attacks use the regular mode; isBasic is a property of the power itself.
 */
export function attackVariants(item) {
	if (item.type !== "power" || !item.hasAttack) {
		return [];
	}
	const system = item.system ?? item.data?.data ?? {};
	const attack = item.attack ?? system.attack ?? {};
	const modes = Array.isArray(system.rollModes) ? system.rollModes : Object.values(system.rollModes ?? {});
	const basicVariants = attack.isBasic === true && ["melee", "weapon"].includes(system.rangeType);
	const variants = [{ id: "regular", label: attack.isBasic ? "Basic attack" : "Regular attack", variance: {} }];
	if (basicVariants || attack.canCharge === true || modes.some(mode => mode?.charge === true || mode?.chargeAttack === true)) {
		variants.push({ id: "charge", label: "Charge", variance: { isCharge: true } });
	}
	if (attack.canOpp === true || modes.some(mode => mode?.opportunityAttack === true)
		|| (item.actor?.type === "NPC" && basicVariants)) {
		variants.push({ id: "opportunity", label: "Opportunity attack", variance: { isOpp: true } });
	}
	return variants;
}
