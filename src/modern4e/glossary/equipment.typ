#import "../helpers/theme.typ" as theme;
#import "../helpers/equipment.typ" as equipment;

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
    #for section in equipment.catalog.sections.filter(section => section.kind != "WEAPON") {
      heading(depth: 2, section.title)
      armorTable(equipment: equipment.sectionRows(section))
    }

    *Skill Penalty:* #text(equipment.catalog.armorRules.armorCheckDescription)
  ]
}
