#import "../helpers/theme.typ" as theme;
#import "../helpers/equipment.typ" as equipment;
#import "../helpers/configuration.typ" as config;
#import "../helpers/revised_rules.typ" as revised;

#let weaponTable(equipment: ()) = {
  return table(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 8pt,
    [*Weapon*],
    [*Proficiency Bonus*],
    [*Damage*],
    [*Properties*],
    [*Weapon Category*],
    ..equipment,
  )
}

#let armorTable(equipment: ()) = {
  return table(
    columns: (1fr, 1fr, 1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 8pt,
    [*Armor*],
    [*Armor Bonus*],
    [*Speed Penalty*],
    [*Skill Penalty*],
    ..equipment,
  )
}

#let equipmentPage() = {
  return [
    #theme.pageTitle(title: "Equipment");

    = Weapons
    #for section in equipment.catalog.sections.filter(section => section.kind == "WEAPON") {
      // Keep the original printed grouping and page breaks independent of IDs.
      if section.id in ("military-one-handed-melee-weapons", "superior-one-handed-melee-weapons") {
        pagebreak()
      }
      heading(depth: 2, section.title)
      weaponTable(equipment: equipment.sectionRows(section))
    }

    = Properties
    #columns(3)[
      #for property in equipment.catalog.properties.filter(property => property.printRule) {
        heading(depth: 2, property.title)
        equipment.propertyRule(property.description)
      }
    ]

    = Armor
    #if config.isRevisedRules [
      *Armor Class (AC)* equals 10 + your armor bonus + half your level (rounded down) + your armor's magic enhancement + the extra AC bonus below. Add your shield bonus if you can use the shield.

      In cloth (including when unarmored), leather, or hide, also add the higher of Dexterity and Intelligence, up to +3. If a feature lets you use a different ability for AC, apply the same +3 limit to that ability. Heavy armor adds no ability points.

      Your extra AC bonus increases by 1 at levels #revised.extraArmorLevels.map(str).join(", ", last: ", and "). These increases add up to +8 by level 29. This progression assumes magic armor reaches +1 at level 2, +2 at level 6, +3 at level 11, +4 at level 16, +5 at level 21, and +6 at level 26.

      For example, a level 8 Fighter with Dexterity +4, hide armor with a +2 enhancement, and no shield has AC 23. That's 10 + 3 from hide + 3 from Dexterity + 4 from level + 2 from magic + 1 from the level 5 increase.

      == Fortitude, Reflex, and Will
      Start with 10 and add your class bonus, half your level (rounded down), your magic neck item's enhancement, and your tier bonus (+1 at level 1, +2 at level 11, +3 at level 21). Then add the higher ability in the pair for that defense. Use Strength or Constitution for Fortitude, Dexterity or Intelligence for Reflex, and Wisdom or Charisma for Will. Add the full ability value and any other bonuses that apply.
    ]
    #for section in equipment.catalog.sections.filter(section => section.kind != "WEAPON") {
      heading(depth: 2, section.title)
      armorTable(equipment: equipment.sectionRows(section))
    }

    *Skill Penalty:* #text(equipment.catalog.armorRules.armorCheckDescription)
  ]
}
