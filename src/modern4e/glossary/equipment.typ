#import "../helpers/theme.typ" as theme;
#import "../helpers/equipment.typ" as equipment;
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

#let armorTable(equipment: (), showAbilityCap: false) = {
  return table(
    columns: if showAbilityCap { 5 } else { 4 },
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 8pt,
    [*Armor*],
    [*Armor Bonus*],
    [*Speed Penalty*],
    [*Skill Penalty*],
    ..if showAbilityCap { ([*Ability Cap*],) } else { () },
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
    In light armor, also add the higher of Dexterity and Intelligence, up to the armor's listed cap. Use the cloth cap when unarmored. If a feature lets you use a different ability for AC, the armor's cap still applies. Heavy armor adds no ability points.

    For example, a level 8 Fighter with Dexterity +4, hide armor with a +2 enhancement, and no shield has AC 23. That's 10 + 3 from hide + 3 from Dexterity + 4 from level + 2 from magic + 1 from the level 5 increase.

    #for section in equipment.catalog.sections.filter(section => section.kind != "WEAPON") {
      heading(depth: 2, section.title)
      let showAbilityCap = section.id == "light-armor"
      armorTable(equipment: equipment.sectionRows(section, showAbilityCap: showAbilityCap), showAbilityCap: showAbilityCap)
    }

    *Skill Penalty:* #text(equipment.catalog.armorRules.armorCheckDescription)
  ]
}
